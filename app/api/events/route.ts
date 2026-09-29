import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { trackMarketplaceEvent } from "@/lib/analytics";
import { consumeRateLimit, fingerprintFromRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = await consumeRateLimit({ key: fingerprintFromRequest(request), action: "events", limit: 60, windowSeconds: 60 });
  if (!limit.allowed) return NextResponse.json({ error: "Rate limit exceeded." }, { status: 429 });
  const user = await getCurrentUser();
  const body = await request.json().catch(()=>null);
  if (!body) return NextResponse.json({ ok: false }, { status: 400 });
  const eventType = String(body.eventType || "").slice(0,80);
  const studioId = body.studioId ? String(body.studioId) : null;
  const bookingId = body.bookingId ? String(body.bookingId) : null;
  const metadata = body.metadata && typeof body.metadata === "object" ? body.metadata : undefined;
  await trackMarketplaceEvent({ eventType, userId: user?.id || null, studioId, bookingId, metadata });
  return NextResponse.json({ ok: true });
}
