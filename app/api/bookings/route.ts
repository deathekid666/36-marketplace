import { NextResponse } from "next/server";
import { BookingConflictError, createBookingHold, createFlashBookingHold } from "@/lib/booking";
import { getCurrentUser } from "@/lib/auth";
import { notifyUser } from "@/lib/notifications";
import { trackMarketplaceEvent } from "@/lib/analytics";
import { consumeRateLimit, fingerprintFromRequest } from "@/lib/rate-limit";
import { scheduleBookingReminders } from "@/lib/reminders";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Log in to book." }, { status: 401 });
  if (user.role !== "CREATOR") return NextResponse.json({ error: "Use a Creator account to book studios." }, { status: 403 });
  if (!user.emailVerifiedAt) return NextResponse.json({ error: "Verify your email before booking." }, { status: 403 });
  const limit = await consumeRateLimit({ key: fingerprintFromRequest(request), action: `booking:${user.id}`, limit: 10, windowSeconds: 900 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many booking attempts. Try again shortly." }, { status: 429 });

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const flashSlotId = String(body.flashSlotId || "");
  const roomId = String(body.roomId || "");
  const startAt = new Date(String(body.startAt || ""));
  const durationMinutes = Number(body.durationMinutes);
  const notes = String(body.notes || "");
  const promoCode = String(body.promoCode || "").trim().slice(0, 32);
  const addons = Array.isArray(body.addons)
    ? body.addons
        .slice(0, 20)
        .map((item: unknown) => {
          const row = item as { addonId?: unknown; quantity?: unknown };
          return { addonId: String(row?.addonId || ""), quantity: Number(row?.quantity || 1) };
        })
        .filter((item: { addonId: string; quantity: number }) => item.addonId && Number.isFinite(item.quantity))
    : [];

  if (!flashSlotId && (!roomId || !Number.isFinite(startAt.getTime()) || !Number.isInteger(durationMinutes))) {
    return NextResponse.json({ error: "Invalid booking details." }, { status: 400 });
  }

  try {
    const booking = flashSlotId
      ? await createFlashBookingHold({ creatorId: user.id, flashSlotId })
      : await createBookingHold({ creatorId: user.id, roomId, startAt, durationMinutes, notes, addons, promoCode });

    if (booking.status === "CONFIRMED") await scheduleBookingReminders(booking.id);
    await Promise.all([
      notifyUser({
        userId: user.id,
        type: "BOOKING_CREATED",
        title: `Booking created at ${booking.studio.name}`,
        body: booking.status === "PENDING_DEPOSIT"
          ? `Your slot is held while the ${booking.depositAmountMad} MAD deposit is pending.`
          : "Your booking is confirmed.",
        href: `/creator/bookings/${booking.id}`,
        email: true,
      }),
      notifyUser({
        userId: booking.studio.ownerId,
        type: "NEW_BOOKING",
        title: `New booking for ${booking.room.name}`,
        body: `${user.name} requested ${booking.durationMinutes / 60}h. Total ${booking.totalAmountMad} MAD.`,
        href: `/owner/bookings/${booking.id}`,
        email: true,
        whatsapp: true,
      }),
      trackMarketplaceEvent({
        eventType: "BOOKING_CREATED",
        userId: user.id,
        studioId: booking.studioId,
        bookingId: booking.id,
        metadata: { source: flashSlotId ? "36_NOW" : "DIRECT", totalMad: booking.totalAmountMad },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      bookingId: booking.id,
      status: booking.status,
      depositAmountMad: booking.depositAmountMad,
      expiresAt: booking.expiresAt,
      redirectTo: `/creator/bookings/${booking.id}?checkout=1`,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof BookingConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error && error.message.includes("ROOM_SLOT_CONFLICT")
      ? "That time was booked by someone else. Choose another slot."
      : "Unable to create the booking.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
