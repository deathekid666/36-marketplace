import { NextResponse } from "next/server";

import { getRoomAvailabilityCalendar } from "@/lib/booking";
import { consumeRateLimit, fingerprintFromRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limit = await consumeRateLimit({
    key: fingerprintFromRequest(request),
    action: "availability-calendar",
    limit: 20,
    windowSeconds: 60,
  });

  if (!limit.allowed) {
    return NextResponse.json(
      { dates: {}, error: "Rate limit exceeded." },
      { status: 429 },
    );
  }

  const url = new URL(request.url);
  const roomId = url.searchParams.get("roomId") || "";
  const startDate = url.searchParams.get("startDate") || "";
  const durationMinutes = Number(
    url.searchParams.get("durationMinutes") || "60",
  );
  const days = Math.min(
    120,
    Math.max(1, Math.round(Number(url.searchParams.get("days") || "90"))),
  );

  if (!roomId || !startDate) {
    return NextResponse.json({ dates: {} });
  }

  const dates = await getRoomAvailabilityCalendar(
    roomId,
    startDate,
    days,
    durationMinutes,
  );

  return NextResponse.json({ dates });
}
