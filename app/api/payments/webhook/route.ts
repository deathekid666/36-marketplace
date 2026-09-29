import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";
import { scheduleBookingReminders } from "@/lib/reminders";
import {
  applyNormalizedPaymentEvent,
  verifyPaymentWebhook,
  type NormalizedPaymentEvent,
} from "@/lib/payments";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-36-signature");

  if (!verifyPaymentWebhook(rawBody, signature)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let body: NormalizedPaymentEvent;
  try {
    body = JSON.parse(rawBody) as NormalizedPaymentEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body.paymentId || !["PAID", "FAILED", "REFUNDED"].includes(body.status)) {
    return NextResponse.json({ error: "Invalid payment event." }, { status: 400 });
  }

  const result = await applyNormalizedPaymentEvent(body);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 404 });

  const booking = await db.booking.findUnique({ where: { id: result.bookingId }, include: { studio: true, creator: true } });
  if (booking) {
    if (body.status === "PAID" && !result.disputed) {
      await scheduleBookingReminders(booking.id);
      await Promise.all([
        notifyUser({ userId: booking.creatorId, type: "PAYMENT_CONFIRMED", title: "Payment confirmed", body: `Your booking at ${booking.studio.name} is confirmed.`, href: `/creator/bookings/${booking.id}`, email: true, whatsapp: true }),
        notifyUser({ userId: booking.studio.ownerId, type: "PAYMENT_CONFIRMED", title: "Booking confirmed", body: `${booking.creator.name}'s deposit is paid.`, href: `/owner/bookings/${booking.id}`, email: true }),
      ]);
    }
    if (body.status === "PAID" && result.disputed) {
      await notifyUser({ userId: booking.creatorId, type: "PAYMENT_REVIEW", title: "Payment received — booking needs review", body: "The slot could not be confirmed safely. 36 created a refund/review case instead of double-booking the room.", href: `/creator/bookings/${booking.id}`, email: true });
    }
    if (body.status === "REFUNDED") {
      await notifyUser({ userId: booking.creatorId, type: "REFUND_CONFIRMED", title: "Refund confirmed", body: `Your refund for ${booking.studio.name} was confirmed.`, href: `/creator/bookings/${booking.id}`, email: true, whatsapp: true });
    }
  }

  return NextResponse.json(result);
}
