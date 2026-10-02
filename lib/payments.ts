import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { reconcileConfirmedRefund } from "@/lib/refunds";

export type NormalizedPaymentEvent = {
  paymentId: string;
  status: "PAID" | "FAILED" | "REFUNDED";
  providerRef?: string;
};

export function verifyPaymentWebhook(rawBody: string, signature: string | null) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET || "";
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature, "utf8");
  const b = Buffer.from(expected, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function applyNormalizedPaymentEvent(event: NormalizedPaymentEvent) {
  const payment = await db.payment.findUnique({
    where: { id: event.paymentId },
    include: { booking: true },
  });
  if (!payment) return { ok: false as const, reason: "PAYMENT_NOT_FOUND" };

  const success = {
    ok: true as const,
    bookingId: payment.bookingId,
    paymentKind: payment.kind,
  };

  if (event.status === "FAILED") {
    if (payment.status === "FAILED") {
      return { ...success, idempotent: true };
    }
    if (payment.status === "PAID" || payment.status === "REFUNDED") {
      return { ...success, idempotent: true, stale: true };
    }

    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        providerRef: event.providerRef || payment.providerRef,
      },
    });
    return success;
  }

  if (event.status === "REFUNDED") {
    if (payment.status === "REFUNDED") {
      return { ...success, idempotent: true };
    }

    const canRefund =
      payment.kind === "REFUND" || payment.status === "PAID";
    if (!canRefund) {
      return { ...success, idempotent: true, stale: true };
    }

    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "REFUNDED",
          providerRef: event.providerRef || payment.providerRef,
          confirmedAt: new Date(),
        },
      });

      await reconcileConfirmedRefund(tx, payment.booking);
    });
    return success;
  }

  if (payment.kind === "REFUND") {
    return { ...success, idempotent: true, stale: true };
  }

  if (payment.status === "PAID") {
    return { ...success, idempotent: true };
  }
  if (payment.status === "REFUNDED") {
    return { ...success, idempotent: true, stale: true };
  }

  if (
    payment.kind === "BALANCE" &&
    payment.booking.status !== "CONFIRMED"
  ) {
    const now = new Date();

    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "PAID",
          providerRef: event.providerRef || payment.providerRef,
          confirmedAt: now,
        },
      });

      await tx.booking.update({
        where: { id: payment.bookingId },
        data: {
          status: "DISPUTED",
          expiresAt: null,
        },
      });

      await tx.payout.updateMany({
        where: {
          bookingId: payment.bookingId,
          status: { in: ["PENDING", "ELIGIBLE"] },
        },
        data: {
          status: "HOLD",
          availableAt: null,
        },
      });

      if (payment.amountMad > 0) {
        await tx.payment.create({
          data: {
            bookingId: payment.bookingId,
            kind: "REFUND",
            amountMad: payment.amountMad,
            currency: payment.currency,
            status: "PENDING",
            provider: payment.provider,
            providerRef: "LATE_BALANCE_AUTO_REFUND",
          },
        });
      }
    });

    return { ...success, disputed: true };
  }

  if (payment.kind !== "DEPOSIT") {
    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "PAID",
          providerRef: event.providerRef || payment.providerRef,
          confirmedAt: new Date(),
        },
      });
      const paid = await tx.payment.aggregate({
        where: {
          bookingId: payment.bookingId,
          kind: { in: ["DEPOSIT", "BALANCE"] },
          status: "PAID",
        },
        _sum: { amountMad: true },
      });
      const fullyPaid =
        (paid._sum.amountMad || 0) >= payment.booking.totalAmountMad;
      await tx.booking.update({
        where: { id: payment.bookingId },
        data: {
          paymentStatus: fullyPaid ? "PAID" : "PARTIALLY_PAID",
        },
      });
    });
    return success;
  }

  const now = new Date();
  const holdExpired =
    payment.booking.status !== "PENDING_DEPOSIT" ||
    (!!payment.booking.expiresAt && payment.booking.expiresAt <= now);

  if (holdExpired) {
    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "PAID",
          providerRef: event.providerRef || payment.providerRef,
          confirmedAt: now,
        },
      });
      await tx.booking.update({
        where: { id: payment.bookingId },
        data: {
          status: "DISPUTED",
          paymentStatus: "PAID",
          expiresAt: null,
        },
      });
      await tx.payout.updateMany({
        where: {
          bookingId: payment.bookingId,
          status: { in: ["PENDING", "ELIGIBLE"] },
        },
        data: { status: "HOLD", availableAt: null },
      });
      if (payment.amountMad > 0) {
        await tx.payment.create({
          data: {
            bookingId: payment.bookingId,
            kind: "REFUND",
            amountMad: payment.amountMad,
            currency: payment.currency,
            status: "PENDING",
            provider: payment.provider,
            providerRef: "LATE_PAYMENT_AUTO_REFUND",
          },
        });
      }
    });
    return { ...success, disputed: true };
  }

  try {
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${payment.booking.roomId}))`;
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "PAID",
            providerRef: event.providerRef || payment.providerRef,
            confirmedAt: now,
          },
        });
        const balanceDue = await tx.payment.aggregate({
          where: {
            bookingId: payment.bookingId,
            kind: "BALANCE",
            status: { not: "PAID" },
          },
          _sum: { amountMad: true },
        });
        await tx.booking.update({
          where: { id: payment.bookingId },
          data: {
            status: "CONFIRMED",
            paymentStatus:
              (balanceDue._sum.amountMad || 0) > 0
                ? "PARTIALLY_PAID"
                : "PAID",
            expiresAt: null,
          },
        });
      },
      { isolationLevel: "Serializable" },
    );
    return success;
  } catch {
    await db.$transaction(async (tx) => {
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status: "PAID",
          providerRef: event.providerRef || payment.providerRef,
          confirmedAt: now,
        },
      });
      await tx.booking.update({
        where: { id: payment.bookingId },
        data: {
          status: "DISPUTED",
          paymentStatus: "PAID",
          expiresAt: null,
        },
      });
      await tx.payout.updateMany({
        where: {
          bookingId: payment.bookingId,
          status: { in: ["PENDING", "ELIGIBLE"] },
        },
        data: { status: "HOLD", availableAt: null },
      });
      if (payment.amountMad > 0) {
        await tx.payment.create({
          data: {
            bookingId: payment.bookingId,
            kind: "REFUND",
            amountMad: payment.amountMad,
            currency: payment.currency,
            status: "PENDING",
            provider: payment.provider,
            providerRef: "CONFLICT_AUTO_REFUND",
          },
        });
      }
    });
    return { ...success, disputed: true };
  }
}
