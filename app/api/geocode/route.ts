import { NextResponse } from "next/server";
import { geocodeAddress } from "@/lib/geocoding";
import { consumeRateLimit, fingerprintFromRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 180);
  if (q.length < 3) return NextResponse.json({ results: [] });
  const limit = await consumeRateLimit({ key: fingerprintFromRequest(request), action: "geocode", limit: 30, windowSeconds: 60 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many location searches." }, { status: 429 });
  const results = await geocodeAddress(q);
  return NextResponse.json({ results });
}
