import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { issueEmailVerification } from "@/lib/account-security";
import { consumeRateLimit, fingerprintFromRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required." }, { status: 401 });
  if (user.emailVerifiedAt) return NextResponse.json({ ok: true, alreadyVerified: true });
  const limit = await consumeRateLimit({ key: fingerprintFromRequest(request), action: `resend-verification:${user.id}`, limit: 3, windowSeconds: 3600 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many verification emails. Try later." }, { status: 429 });
  await issueEmailVerification(user.id);
  return NextResponse.json({ ok: true });
}
