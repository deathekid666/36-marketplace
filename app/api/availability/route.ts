import { NextResponse } from "next/server";
import { getRoomAvailability } from "@/lib/booking";
import { consumeRateLimit, fingerprintFromRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const limit = await consumeRateLimit({ key: fingerprintFromRequest(request), action: "availability", limit: 60, windowSeconds: 60 });
  if (!limit.allowed) return NextResponse.json({ slots: [], error: "Rate limit exceeded." }, { status: 429 });
  const url = new URL(request.url);
  const roomId = url.searchParams.get("roomId") || "";
  const date = url.searchParams.get("date") || "";
  const durationMinutes = Number(url.searchParams.get("durationMinutes") || "60");
  if (!roomId || !date) return NextResponse.json({ slots: [] });
  const slots = await getRoomAvailability(roomId, date, durationMinutes);
  return NextResponse.json({ slots });
}
