import { createHmac, timingSafeEqual } from "node:crypto";
import type { PaymentStatus } from "@prisma/client";

import { db } from "@/lib/db";

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

  if (event.status === "FAILED") {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", providerRef: event.providerRef || payment.providerRef },
    });
    return { ok: true as const, bookingId: payment.bookingId };
  }

  if (event.status === "REFUNDED") {
    await db.$transaction([
      db.payment.update({
        where: { id: payment.id },
        data: {
          status: "REFUNDED",
          providerRef: event.providerRef || payment.providerRef,
          confirmedAt: new Date(),
        },
      }),
      db.booking.update({
        where: { id: payment.bookingId },
        data: { paymentStatus: "REFUNDED" },
      }),
    ]);
    return { ok: true as const, bookingId: payment.bookingId };
  }

  if (payment.status === "PAID") {
    return { ok: true as const, bookingId: payment.bookingId, idempotent: true };
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
        where: { bookingId: payment.bookingId, kind: { in: ["DEPOSIT", "BALANCE"] }, status: "PAID" },
        _sum: { amountMad: true },
      });
      const fullyPaid = (paid._sum.amountMad || 0) >= payment.booking.totalAmountMad;
      await tx.booking.update({
        where: { id: payment.bookingId },
        data: { paymentStatus: fullyPaid ? "PAID" : "PARTIALLY_PAID" },
      });
    });
    return { ok: true as const, bookingId: payment.bookingId };
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
        data: { status: "DISPUTED", paymentStatus: "PAID", expiresAt: null },
      });
      await tx.payout.updateMany({ where: { bookingId: payment.bookingId, status: { in: ["PENDING", "ELIGIBLE"] } }, data: { status: "HOLD" } });
      const existingRefund = await tx.payment.findFirst({
        where: { bookingId: payment.bookingId, kind: "REFUND", status: "PENDING" },
      });
      if (!existingRefund && payment.amountMad > 0) {
        await tx.payment.create({
          data: {
            bookingId: payment.bookingId,
            kind: "REFUND",
            amountMad: payment.amountMad,
            status: "PENDING",
            provider: payment.provider,
            providerRef: "LATE_PAYMENT_AUTO_REFUND",
          },
        });
      }
    });
    return { ok: true as const, bookingId: payment.bookingId, disputed: true };
  }

  try {
    await db.$transaction(async (tx) => {
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
        where: { bookingId: payment.bookingId, kind: "BALANCE", status: { not: "PAID" } },
        _sum: { amountMad: true },
      });
      await tx.booking.update({
        where: { id: payment.bookingId },
        data: {
          status: "CONFIRMED",
          paymentStatus: (balanceDue._sum.amountMad || 0) > 0 ? "PARTIALLY_PAID" : "PAID",
          expiresAt: null,
        },
      });
    }, { isolationLevel: "Serializable" });
    return { ok: true as const, bookingId: payment.bookingId };
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
        data: { status: "DISPUTED", paymentStatus: "PAID", expiresAt: null },
      });
      await tx.payout.updateMany({ where: { bookingId: payment.bookingId, status: { in: ["PENDING", "ELIGIBLE"] } }, data: { status: "HOLD" } });
      const existingRefund = await tx.payment.findFirst({
        where: { bookingId: payment.bookingId, kind: "REFUND", status: "PENDING" },
      });
      if (!existingRefund && payment.amountMad > 0) {
        await tx.payment.create({
          data: {
            bookingId: payment.bookingId,
            kind: "REFUND",
            amountMad: payment.amountMad,
            status: "PENDING",
            provider: payment.provider,
            providerRef: "CONFLICT_AUTO_REFUND",
          },
        });
      }
    });
    return { ok: true as const, bookingId: payment.bookingId, disputed: true };
  }
}
