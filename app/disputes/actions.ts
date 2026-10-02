"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";

function text(form: FormData, name: string, max = 2000) {
  return String(form.get(name) || "").trim().slice(0, max);
}

export async function openDisputeAction(form: FormData) {
  const user = await requireUser();
  const bookingId = text(form, "bookingId", 80);
  const reason = text(form, "reason", 160);
  const details = text(form, "details", 3000);

  if (!reason) return;

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { studio: true, dispute: true },
  });
  if (!booking || booking.dispute) return;

  const allowed =
    user.role === "ADMIN" ||
    (user.role === "CREATOR" &&
      booking.creatorId === user.id) ||
    (user.role === "STUDIO_OWNER" &&
      booking.studio.ownerId === user.id);
  if (!allowed) return;

  await db.$transaction([
    db.dispute.create({
      data: {
        bookingId,
        openedById: user.id,
        reason,
        details,
      },
    }),
    db.booking.update({
      where: { id: bookingId },
      data: { status: "DISPUTED" },
    }),
    db.payout.updateMany({
      where: {
        bookingId,
        status: { in: ["PENDING", "ELIGIBLE"] },
      },
      data: {
        status: "HOLD",
        availableAt: null,
      },
    }),
  ]);

  const admins = await db.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE" },
    select: { id: true },
  });

  await Promise.all(
    admins.map((admin) =>
      notifyUser({
        userId: admin.id,
        type: "DISPUTE_OPENED",
        title: "New booking dispute",
        body: reason + " · " + booking.studio.name,
        href: "/admin/disputes",
        email: true,
      }),
    ),
  );

  revalidatePath("/creator/bookings/" + bookingId);
  revalidatePath("/owner/bookings/" + bookingId);
  revalidatePath("/admin/disputes");

  redirect(
    user.role === "STUDIO_OWNER"
      ? "/owner/bookings/" + bookingId + "?dispute=1"
      : "/creator/bookings/" + bookingId + "?dispute=1",
  );
}

export async function resolveDisputeAction(form: FormData) {
  const admin = await requireRole("ADMIN");
  const disputeId = text(form, "disputeId", 80);
  const resolution = text(form, "resolution", 3000);
  const status =
    text(form, "status", 40) === "REJECTED"
      ? "REJECTED"
      : "RESOLVED";
  const requestedRefund = Math.max(
    0,
    Math.round(Number(form.get("refundAmountMad")) || 0),
  );

  const dispute = await db.dispute.findUnique({
    where: { id: disputeId },
    include: {
      booking: {
        include: {
          studio: true,
        },
      },
    },
  });
  if (!dispute) return;

  const outcome = await db.$transaction(async (tx) => {
    const [paidCharges, existingRefunds] = await Promise.all([
      tx.payment.aggregate({
        where: {
          bookingId: dispute.bookingId,
          kind: { in: ["DEPOSIT", "BALANCE"] },
          status: "PAID",
        },
        _sum: { amountMad: true },
      }),
      tx.payment.aggregate({
        where: {
          bookingId: dispute.bookingId,
          kind: "REFUND",
          status: { in: ["PENDING", "REFUNDED"] },
        },
        _sum: { amountMad: true },
      }),
    ]);

    const paidAmount = Math.max(
      0,
      paidCharges._sum.amountMad || 0,
    );
    const existingRefundAmount = Math.max(
      0,
      existingRefunds._sum.amountMad || 0,
    );
    const maxRefundable = Math.min(
      dispute.booking.totalAmountMad,
      paidAmount,
    );
    const refundAmount =
      status === "RESOLVED"
        ? Math.min(requestedRefund, maxRefundable)
        : 0;
    const additionalRefund = Math.max(
      0,
      refundAmount - existingRefundAmount,
    );

    await tx.dispute.update({
      where: { id: dispute.id },
      data: {
        status,
        assignedAdminId: admin.id,
        resolution,
        refundAmountMad: refundAmount,
        resolvedAt: new Date(),
      },
    });

    if (additionalRefund > 0) {
      await tx.payment.create({
        data: {
          bookingId: dispute.bookingId,
          kind: "REFUND",
          amountMad: additionalRefund,
          currency: dispute.booking.currency,
          status: "PENDING",
          provider:
            process.env.PAYMENT_PROVIDER || "MANUAL",
          providerRef: "DISPUTE_REFUND",
        },
      });
    }

    const restored =
      dispute.booking.endAt <= new Date()
        ? "COMPLETED"
        : "CONFIRMED";
    const fullyRefundingCollected =
      paidAmount > 0 && refundAmount >= paidAmount;
    const nextBookingStatus =
      status === "REJECTED"
        ? restored
        : fullyRefundingCollected
          ? "CANCELLED"
          : restored;

    await tx.booking.update({
      where: { id: dispute.bookingId },
      data: { status: nextBookingStatus },
    });

    if (status === "REJECTED" || refundAmount === 0) {
      await tx.payout.updateMany({
        where: {
          bookingId: dispute.bookingId,
          status: "HOLD",
        },
        data: {
          status:
            restored === "COMPLETED"
              ? "ELIGIBLE"
              : "PENDING",
          availableAt:
            restored === "COMPLETED"
              ? new Date()
              : null,
        },
      });
    } else {
      await tx.payout.updateMany({
        where: {
          bookingId: dispute.bookingId,
          status: { in: ["PENDING", "ELIGIBLE"] },
        },
        data: {
          status: "HOLD",
          availableAt: null,
        },
      });
    }

    return {
      refundAmount,
      maxRefundable,
    };
  });

  const resolutionBody =
    resolution || "36 has completed the dispute review.";
  const refundNote =
    outcome.refundAmount > 0
      ? " Refund approved: " + outcome.refundAmount + " " + dispute.booking.currency + "."
      : "";

  await Promise.all([
    notifyUser({
      userId: dispute.booking.creatorId,
      type: "DISPUTE_RESOLVED",
      title: "Dispute " + status.toLowerCase(),
      body: resolutionBody + refundNote,
      href: "/creator/bookings/" + dispute.bookingId,
      email: true,
    }),
    notifyUser({
      userId: dispute.booking.studio.ownerId,
      type: "DISPUTE_RESOLVED",
      title: "Dispute " + status.toLowerCase(),
      body: resolutionBody + refundNote,
      href: "/owner/bookings/" + dispute.bookingId,
      email: true,
    }),
  ]);

  revalidatePath("/admin/disputes");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/payouts");
  revalidatePath("/owner/revenue");
  revalidatePath("/creator/bookings/" + dispute.bookingId);
  revalidatePath("/owner/bookings/" + dispute.bookingId);

  redirect("/admin/disputes?resolved=1");
}
