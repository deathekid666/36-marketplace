import { NextResponse } from "next/server";

import { getCurrentUser, hasCreatorAccess } from "@/lib/auth";
import {
  BookingConflictError,
  getBookingQuote,
} from "@/lib/booking";
import {
  consumeRateLimit,
  fingerprintFromRequest,
} from "@/lib/rate-limit";
import { trackMarketplaceEvent } from "@/lib/analytics";
import { expireStaleBookingHolds } from "@/lib/booking-lifecycle";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Log in to review booking price." },
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
    action: "booking-quote:" + user.id,
    limit: 40,
    windowSeconds: 15 * 60,
  });

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many price checks. Try again shortly." },
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

  const roomId = String(body.roomId || "");
  const startAt = new Date(String(body.startAt || ""));
  const durationMinutes = Number(body.durationMinutes);
  const promoCode = String(body.promoCode || "")
    .trim()
    .slice(0, 32);

  const addons = Array.isArray(body.addons)
    ? body.addons
        .slice(0, 20)
        .map((item: unknown) => {
          const row = item as {
            addonId?: unknown;
            quantity?: unknown;
          };
          return {
            addonId: String(row.addonId || ""),
            quantity: Number(row.quantity || 1),
          };
        })
        .filter(
          (item: { addonId: string; quantity: number }) =>
            item.addonId && Number.isFinite(item.quantity),
        )
    : [];

  if (
    !roomId ||
    !Number.isFinite(startAt.getTime()) ||
    !Number.isInteger(durationMinutes)
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

    const quote = await getBookingQuote({
      creatorId: user.id,
      roomId,
      startAt,
      durationMinutes,
      addons,
      promoCode,
    });

    await trackMarketplaceEvent({
      eventType: "BOOKING_STARTED",
      userId: user.id,
      studioId: quote.studioId,
      metadata: {
        roomId: quote.roomId,
        durationMinutes: quote.durationMinutes,
        totalAmount: quote.totalAmountMad,
        currency: quote.currency,
      },
    });

    return NextResponse.json({ ok: true, quote });
  } catch (error) {
    if (error instanceof BookingConflictError) {
      return NextResponse.json(
        { error: error.message },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Unable to calculate this booking." },
      { status: 400 },
    );
  }
}
