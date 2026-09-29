"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";
import { scheduleBookingReminders } from "@/lib/reminders";

function text(form: FormData, name: string, max = 1000) {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

export async function setPaymentLinkAction(form: FormData) {
  await requireRole("ADMIN");
  const paymentId = text(form, "paymentId", 80);
  const checkoutUrl = text(form, "checkoutUrl", 1200);
  const provider = text(form, "provider", 80) || "PAYMENT_LINK";
  if (!/^https:\/\//i.test(checkoutUrl)) redirect("/admin/payments?error=link");
  const payment = await db.payment.findFirst({ where: { id: paymentId, status: "PENDING" }, include: { booking: { include: { studio: true } } } });
  if (!payment) redirect("/admin/payments?error=missing");
  await db.payment.update({ where: { id: payment.id }, data: { checkoutUrl, provider } });
  await notifyUser({ userId: payment.booking.creatorId, type: "PAYMENT_LINK_READY", title: "Your 36 payment link is ready", body: `${payment.amountMad} MAD for ${payment.booking.studio.name}.`, href: `/creator/bookings/${payment.bookingId}`, email: true, whatsapp: true });
  revalidatePath("/admin/payments");
  revalidatePath(`/creator/bookings/${payment.bookingId}`);
  redirect("/admin/payments?linked=1");
}

export async function confirmDepositAction(form: FormData) {
  const admin = await requireRole("ADMIN");
  const paymentId = text(form, "paymentId", 80);
  const providerRef = text(form, "providerRef", 160);

  const payment = await db.payment.findFirst({
    where: { id: paymentId, kind: "DEPOSIT", status: "PENDING" },
    include: { booking: { include: { studio: true, creator: true } } },
  });
  if (!payment) redirect("/admin/payments?error=missing");
  if (payment.booking.expiresAt && payment.booking.expiresAt <= new Date()) {
    await db.$transaction([
      db.booking.update({ where: { id: payment.bookingId }, data: { status: "EXPIRED" } }),
      db.payment.update({ where: { id: payment.id }, data: { status: "FAILED", providerRef } }),
    ]);
    redirect("/admin/payments?error=expired");
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${payment.booking.roomId}))`;
      await tx.payment.update({
        where: { id: payment.id },
        data: { status: "PAID", providerRef, confirmedAt: new Date(), confirmedById: admin.id },
      });
      const balanceDue = await tx.payment.aggregate({
        where: { bookingId: payment.bookingId, kind: "BALANCE", status: { not: "PAID" } },
        _sum: { amountMad: true },
      });
      await tx.booking.update({
        where: { id: payment.bookingId },
        data: { status: "CONFIRMED", paymentStatus: (balanceDue._sum.amountMad || 0) > 0 ? "PARTIALLY_PAID" : "PAID", expiresAt: null },
      });
    }, { isolationLevel: "Serializable" });
  } catch {
    redirect("/admin/payments?error=conflict");
  }

  await scheduleBookingReminders(payment.bookingId);
  await Promise.all([
    notifyUser({ userId: payment.booking.creatorId, type: "DEPOSIT_CONFIRMED", title: "Deposit confirmed", body: `Your booking at ${payment.booking.studio.name} is confirmed.`, href: `/creator/bookings/${payment.bookingId}`, email: true, whatsapp: true }),
    notifyUser({ userId: payment.booking.studio.ownerId, type: "DEPOSIT_CONFIRMED", title: "Booking deposit confirmed", body: `${payment.booking.creator.name}'s booking is confirmed.`, href: `/owner/bookings/${payment.bookingId}`, email: true }),
  ]);
  revalidatePath("/admin/payments");
  revalidatePath("/creator/bookings");
  revalidatePath(`/creator/bookings/${payment.bookingId}`);
  revalidatePath("/owner/bookings");
  redirect("/admin/payments?confirmed=1");
}


export async function confirmBalanceAction(form: FormData) {
  const admin = await requireRole("ADMIN");
  const paymentId = text(form, "paymentId", 80);
  const providerRef = text(form, "providerRef", 160);
  const payment = await db.payment.findFirst({
    where: { id: paymentId, kind: "BALANCE", status: "PENDING", booking: { status: "CONFIRMED" } },
    include: { booking: { include: { studio: true, creator: true } } },
  });
  if (!payment) redirect("/admin/payments?error=missing");

  await db.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "PAID", providerRef, confirmedAt: new Date(), confirmedById: admin.id },
    });
    const paid = await tx.payment.aggregate({
      where: { bookingId: payment.bookingId, kind: { in: ["DEPOSIT", "BALANCE"] }, status: "PAID" },
      _sum: { amountMad: true },
    });
    await tx.booking.update({
      where: { id: payment.bookingId },
      data: { paymentStatus: (paid._sum.amountMad || 0) >= payment.booking.totalAmountMad ? "PAID" : "PARTIALLY_PAID" },
    });
  });

  await notifyUser({
    userId: payment.booking.creatorId,
    type: "BALANCE_CONFIRMED",
    title: "Booking fully paid",
    body: `${payment.booking.studio.name} is fully paid.`,
    href: `/creator/bookings/${payment.bookingId}`,
    email: true,
  });
  revalidatePath("/admin/payments");
  revalidatePath(`/creator/bookings/${payment.bookingId}`);
  revalidatePath(`/owner/bookings/${payment.bookingId}`);
  redirect("/admin/payments?balance=1");
}

export async function confirmRefundAction(form: FormData) {
  const admin = await requireRole("ADMIN");
  const paymentId = text(form, "paymentId", 80);
  const providerRef = text(form, "providerRef", 160);
  const refund = await db.payment.findFirst({
    where: { id: paymentId, kind: "REFUND", status: "PENDING" },
    include: { booking: { include: { studio: true } } },
  });
  if (!refund) redirect("/admin/payments?error=missing");

  await db.$transaction([
    db.payment.update({
      where: { id: refund.id },
      data: {
        status: "REFUNDED",
        providerRef,
        confirmedAt: new Date(),
        confirmedById: admin.id,
      },
    }),
    db.booking.update({
      where: { id: refund.bookingId },
      data: { paymentStatus: "REFUNDED" },
    }),
  ]);

  await notifyUser({ userId: refund.booking.creatorId, type: "REFUND_CONFIRMED", title: "Refund confirmed", body: `${refund.amountMad} MAD refund for ${refund.booking.studio.name} has been marked completed.`, href: `/creator/bookings/${refund.bookingId}`, email: true, whatsapp: true });
  revalidatePath("/admin/payments");
  revalidatePath(`/creator/bookings/${refund.bookingId}`);
  redirect("/admin/payments?refunded=1");
}
