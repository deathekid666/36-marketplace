import { NextResponse } from "next/server";

import { getCurrentUser, hasCreatorAccess } from "@/lib/auth";
import {
  BookingConflictError,
  createBookingHold,
  createFlashBookingHold,
} from "@/lib/booking";
import { notifyUser } from "@/lib/notifications";
import { trackMarketplaceEvent } from "@/lib/analytics";
import {
  consumeRateLimit,
  fingerprintFromRequest,
} from "@/lib/rate-limit";
import { scheduleBookingReminders } from "@/lib/reminders";
import { expireStaleBookingHolds } from "@/lib/booking-lifecycle";
import { formatMoney } from "@/lib/commerce";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Log in to book." },
      { status: 401 },
    );
  }

  if (!hasCreatorAccess(user.role)) {
    return NextResponse.json(
      { error: "This account cannot book studios." },
      { status: 403 },
    );
  }

  if (!user.emailVerifiedAt) {
    return NextResponse.json(
      { error: "Verify your email before booking." },
      { status: 403 },
    );
  }

  const limit = await consumeRateLimit({
    key: fingerprintFromRequest(request),
    action: "booking:" + user.id,
    limit: 10,
    windowSeconds: 900,
  });

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many booking attempts. Try again shortly." },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 },
    );
  }

  const flashSlotId = String(body.flashSlotId || "");
  const roomId = String(body.roomId || "");
  const startAt = new Date(String(body.startAt || ""));
  const durationMinutes = Number(body.durationMinutes);
  const notes = String(body.notes || "");
  const promoCode = String(body.promoCode || "")
    .trim()
    .slice(0, 32);
  const expectedTotalMad = Number(body.expectedTotalMad);
  const paymentMethod = String(body.paymentMethod || "")
    .trim()
    .toUpperCase();

  const addons = Array.isArray(body.addons)
    ? body.addons
        .slice(0, 20)
        .map((item: unknown) => {
          const row = item as {
            addonId?: unknown;
            quantity?: unknown;
          };
          return {
            addonId: String(row?.addonId || ""),
            quantity: Number(row?.quantity || 1),
          };
        })
        .filter(
          (item: { addonId: string; quantity: number }) =>
            item.addonId && Number.isFinite(item.quantity),
        )
    : [];

  if (
    !flashSlotId &&
    (!roomId ||
      !Number.isFinite(startAt.getTime()) ||
      !Number.isInteger(durationMinutes))
  ) {
    return NextResponse.json(
      { error: "Invalid booking details." },
      { status: 400 },
    );
  }

  try {
    await expireStaleBookingHolds({
      creatorId: user.id,
      limit: 50,
    });

    const booking = flashSlotId
      ? await createFlashBookingHold({
          creatorId: user.id,
          flashSlotId,
        })
      : await createBookingHold({
          creatorId: user.id,
          roomId,
          startAt,
          durationMinutes,
          notes,
          addons,
          promoCode,
          expectedTotalMad: Number.isFinite(expectedTotalMad)
            ? Math.round(expectedTotalMad)
            : undefined,
          paymentMethod,
        });

    if (booking.status === "CONFIRMED") {
      await scheduleBookingReminders(booking.id);
    }

    const pendingProvider =
      booking.payments.find((payment) => payment.status === "PENDING")
        ?.provider || null;

    await Promise.all([
      notifyUser({
        userId: user.id,
        type: "BOOKING_CREATED",
        title: "Booking created at " + booking.studio.name,
        body:
          booking.status === "PENDING_DEPOSIT"
            ? "Your slot is held while the " +
              formatMoney(booking.depositAmountMad, booking.currency) +
              " deposit is pending."
            : pendingProvider
              ? "Your booking is confirmed. Payment method: " +
                pendingProvider.replaceAll("_", " ").toLowerCase() +
                "."
              : "Your booking is confirmed.",
        href: "/creator/bookings/" + booking.id,
        email: true,
      }),
      notifyUser({
        userId: booking.studio.ownerId,
        type: "NEW_BOOKING",
        title: "New booking for " + booking.room.name,
        body:
          user.name +
          " requested " +
          booking.durationMinutes / 60 +
          "h. Total " +
          formatMoney(booking.totalAmountMad, booking.currency) +
          ".",
        href: "/owner/bookings/" + booking.id,
        email: true,
        whatsapp: true,
      }),
      trackMarketplaceEvent({
        eventType: "BOOKING_CREATED",
        userId: user.id,
        studioId: booking.studioId,
        bookingId: booking.id,
        metadata: {
          source: flashSlotId ? "36_NOW" : "DIRECT",
          totalAmount: booking.totalAmountMad,
          currency: booking.currency,
          paymentMethod: pendingProvider,
        },
      }),
    ]);

    return NextResponse.json(
      {
        ok: true,
        bookingId: booking.id,
        status: booking.status,
        depositAmountMad: booking.depositAmountMad,
        totalAmountMad: booking.totalAmountMad,
        currency: booking.currency,
        paymentStatus: booking.paymentStatus,
        paymentProvider: pendingProvider,
        expiresAt: booking.expiresAt,
        redirectTo:
          "/creator/bookings/" +
          booking.id +
          (booking.status === "PENDING_DEPOSIT"
            ? "?checkout=1"
            : "?booked=1"),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof BookingConflictError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 },
      );
    }

    const message =
      error instanceof Error &&
      error.message.includes("ROOM_SLOT_CONFLICT")
        ? "That time was booked by someone else. Choose another slot."
        : "Unable to create the booking.";

    return NextResponse.json({ error: message }, { status: 400 });
  }
}
