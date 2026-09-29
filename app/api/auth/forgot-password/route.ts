import { NextResponse } from "next/server";
import { issuePasswordReset } from "@/lib/account-security";
import { consumeRateLimit, fingerprintFromRequest } from "@/lib/rate-limit";
import { normalizeEmail } from "@/lib/validation";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const limit = await consumeRateLimit({ key: fingerprintFromRequest(request), action: "forgot-password", limit: 5, windowSeconds: 3600 });
  if (!limit.allowed) return NextResponse.json({ ok: true });
  const body = await request.json().catch(() => ({}));
  const email = normalizeEmail(body.email);
  if (email) await issuePasswordReset(email).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
