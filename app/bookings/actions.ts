"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";
import { ensureInvoice } from "@/lib/invoices";
import {
  isOfflinePaymentProvider,
  offlinePaymentLabel,
} from "@/lib/offline-payment";

function text(form: FormData, name: string, max = 2000) {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

async function accessibleBooking(bookingId: string, user: Awaited<ReturnType<typeof requireUser>>) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: { studio: true, creator: true },
  });
  if (!booking) return null;
  if (user.role === "ADMIN") return booking;
  if (user.role === "CREATOR" && booking.creatorId === user.id) return booking;
  if (user.role === "STUDIO_OWNER" && booking.studio.ownerId === user.id) return booking;
  return null;
}

function bookingPath(role: string, bookingId: string) {
  return role === "STUDIO_OWNER" ? `/owner/bookings/${bookingId}` : `/creator/bookings/${bookingId}`;
}

export async function sendBookingMessageAction(form: FormData) {
  const user = await requireUser();
  const bookingId = text(form, "bookingId", 80);
  const body = text(form, "body", 2000);
  if (!body) return;
  const booking = await accessibleBooking(bookingId, user);
  if (!booking) return;

  const conversation = await db.conversation.upsert({
    where: { bookingId },
    create: { bookingId },
    update: {},
  });
  await db.message.create({
    data: { conversationId: conversation.id, senderId: user.id, body },
  });
  const recipientId = user.role === "CREATOR" ? booking.studio.ownerId : booking.creatorId;
  await notifyUser({
    userId: recipientId,
    type: "BOOKING_MESSAGE",
    title: `New message about ${booking.studio.name}`,
    body: body.slice(0, 180),
    href: user.role === "CREATOR" ? `/owner/bookings/${bookingId}` : `/creator/bookings/${bookingId}`,
    email: true,
  });

  revalidatePath(`/creator/bookings/${bookingId}`);
  revalidatePath(`/owner/bookings/${bookingId}`);
  redirect(bookingPath(user.role, bookingId));
}

export async function cancelBookingAction(form: FormData) {
  const user = await requireRole("CREATOR");
  const bookingId = text(form, "bookingId", 80);
  const reason = text(form, "reason", 500);
  const booking = await db.booking.findFirst({
    where: { id: bookingId, creatorId: user.id },
    include: { studio: true, payments: true, flashSlot: true },
  });
  if (!booking || !["PENDING_DEPOSIT", "CONFIRMED"].includes(booking.status)) {
    redirect(`/creator/bookings/${bookingId}?error=cancel`);
  }
  if (booking.startAt <= new Date()) {
    redirect(`/creator/bookings/${bookingId}?error=started`);
  }

  const paidDeposit = booking.payments
    .filter((p) => p.kind === "DEPOSIT" && p.status === "PAID")
    .reduce((sum, p) => sum + p.amountMad, 0);
  const leadHours = (booking.startAt.getTime() - Date.now()) / 3600000;
  const refundable = leadHours >= booking.studio.freeCancellationHours;
  const refundAmountMad = refundable ? paidDeposit : 0;

  await db.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: user.id,
        cancellationReason: reason,
        refundAmountMad,
        expiresAt: null,
      },
    });
    await tx.payment.updateMany({
      where: { bookingId: booking.id, status: "PENDING", kind: { not: "REFUND" } },
      data: { status: "FAILED" },
    });
    await tx.payout.updateMany({ where: { bookingId: booking.id, status: { in: ["PENDING", "ELIGIBLE"] } }, data: { status: "HOLD" } });
    if (refundAmountMad > 0) {
      const existing = await tx.payment.findFirst({
        where: { bookingId: booking.id, kind: "REFUND", status: { in: ["PENDING", "REFUNDED"] } },
      });
      if (!existing) {
        const deposit = booking.payments.find((p) => p.kind === "DEPOSIT" && p.status === "PAID");
        await tx.payment.create({
          data: {
            bookingId: booking.id,
            kind: "REFUND",
            amountMad: refundAmountMad,
            status: "PENDING",
            provider: deposit?.provider || process.env.PAYMENT_PROVIDER || "MANUAL",
            providerRef: "CANCELLATION_REFUND",
          },
        });
      }
    }
    if (booking.flashSlotId && booking.flashSlot && booking.flashSlot.expiresAt > new Date()) {
      await tx.flashSlot.update({
        where: { id: booking.flashSlotId },
        data: { status: "ACTIVE" },
      });
    }
  });

  await notifyUser({
    userId: booking.studio.ownerId,
    type: "BOOKING_CANCELLED",
    title: `Booking cancelled by ${user.name}`,
    body: `${booking.totalAmountMad} MAD booking. ${refundAmountMad ? `Refund requested: ${refundAmountMad} MAD.` : "No automatic refund due."}`,
    href: `/owner/bookings/${booking.id}`,
    email: true,
    whatsapp: true,
  });
  revalidatePath("/creator/bookings");
  revalidatePath("/owner/bookings");
  revalidatePath("/now");
  redirect(`/creator/bookings/${booking.id}?cancelled=1`);
}

export async function confirmOfflinePaymentAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const bookingId = text(form, "bookingId", 80);

  const booking = await db.booking.findFirst({
    where: {
      id: bookingId,
      studio: { ownerId: user.id },
      status: "CONFIRMED",
    },
    include: {
      studio: true,
      creator: true,
      payments: true,
    },
  });

  if (!booking) {
    redirect("/owner/bookings/" + bookingId + "?error=payment");
  }

  const pendingOffline = booking.payments.filter(
    (payment) =>
      payment.status === "PENDING" &&
      isOfflinePaymentProvider(payment.provider),
  );

  if (pendingOffline.length === 0) {
    redirect("/owner/bookings/" + bookingId + "?error=payment");
  }

  const method =
    offlinePaymentLabel(pendingOffline[0]?.provider) ||
    "Offline payment";

  await db.$transaction(async (tx) => {
    await tx.payment.updateMany({
      where: {
        id: { in: pendingOffline.map((payment) => payment.id) },
      },
      data: {
        status: "PAID",
        confirmedAt: new Date(),
        confirmedById: user.id,
      },
    });

    const paid = await tx.payment.aggregate({
      where: {
        bookingId,
        kind: { in: ["DEPOSIT", "BALANCE"] },
        status: "PAID",
      },
      _sum: { amountMad: true },
    });

    await tx.booking.update({
      where: { id: bookingId },
      data: {
        paymentStatus:
          (paid._sum.amountMad || 0) >= booking.totalAmountMad
            ? "PAID"
            : "PARTIALLY_PAID",
      },
    });
  });

  await notifyUser({
    userId: booking.creatorId,
    type: "OFFLINE_PAYMENT_CONFIRMED",
    title: "Studio confirmed your payment",
    body:
      method +
      " received for " +
      booking.studio.name +
      ".",
    href: "/creator/bookings/" + booking.id,
    email: true,
  });

  revalidatePath("/owner/bookings");
  revalidatePath("/owner/bookings/" + booking.id);
  revalidatePath("/creator/bookings");
  revalidatePath("/creator/bookings/" + booking.id);

  redirect("/owner/bookings/" + booking.id + "?paid=1");
}

export async function completeBookingAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const bookingId = text(form, "bookingId", 80);
  const booking = await db.booking.findFirst({
    where: { id: bookingId, studio: { ownerId: user.id }, status: "CONFIRMED", paymentStatus: "PAID" },
  });
  if (!booking || booking.endAt > new Date()) {
    redirect(`/owner/bookings/${bookingId}?error=complete`);
  }
  await db.$transaction([
    db.booking.update({ where: { id: booking.id }, data: { status: "COMPLETED" } }),
    db.payout.updateMany({ where: { bookingId: booking.id, status: "PENDING" }, data: { status: "ELIGIBLE", availableAt: new Date() } }),
    db.referral.updateMany({ where: { inviteeId: booking.creatorId, status: "PENDING" }, data: { status: "QUALIFIED", qualifiedAt: new Date() } }),
  ]);
  await ensureInvoice(booking.id).catch(() => null);
  await notifyUser({ userId: booking.creatorId, type: "BOOKING_COMPLETED", title: "Session completed", body: "You can now leave a verified review for the studio.", href: `/creator/bookings/${booking.id}`, email: true });
  revalidatePath(`/owner/bookings/${booking.id}`);
  revalidatePath(`/creator/bookings/${booking.id}`);
  redirect(`/owner/bookings/${booking.id}?completed=1`);
}

function rating(value: FormDataEntryValue | null) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n >= 1 && n <= 5 ? n : null;
}

export async function submitReviewAction(form: FormData) {
  const user = await requireRole("CREATOR");
  const bookingId = text(form, "bookingId", 80);
  const booking = await db.booking.findFirst({
    where: { id: bookingId, creatorId: user.id, status: "COMPLETED" },
    include: { review: true, studio: true },
  });
  if (!booking || booking.review) redirect(`/creator/bookings/${bookingId}`);

  const values = {
    rating: rating(form.get("rating")),
    accuracy: rating(form.get("accuracy")),
    equipment: rating(form.get("equipment")),
    communication: rating(form.get("communication")),
  };
  if (Object.values(values).some((v) => v === null)) {
    redirect(`/creator/bookings/${bookingId}?error=review`);
  }

  await db.review.create({
    data: {
      bookingId,
      creatorId: user.id,
      studioId: booking.studioId,
      rating: values.rating!,
      accuracy: values.accuracy!,
      equipment: values.equipment!,
      communication: values.communication!,
      comment: text(form, "comment", 2000),
    },
  });
  await notifyUser({ userId: booking.studio.ownerId, type: "NEW_REVIEW", title: `New verified review from ${user.name}`, body: `Overall rating: ${values.rating}/5`, href: `/owner/bookings/${bookingId}`, email: true });
  revalidatePath(`/creator/bookings/${bookingId}`);
  revalidatePath(`/studios`);
  redirect(`/creator/bookings/${bookingId}?reviewed=1`);
}

export async function replyToReviewAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const reviewId = text(form, "reviewId", 80);
  const bookingId = text(form, "bookingId", 80);
  const reply = text(form, "reply", 1500);
  const review = await db.review.findFirst({
    where: { id: reviewId, studio: { ownerId: user.id } },
  });
  if (!review) return;
  await db.review.update({ where: { id: review.id }, data: { ownerReply: reply } });
  revalidatePath(`/owner/bookings/${bookingId}`);
  revalidatePath(`/studios`);
}
