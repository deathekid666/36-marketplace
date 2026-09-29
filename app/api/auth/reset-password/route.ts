import { NextResponse } from "next/server";
import { consumePasswordResetToken } from "@/lib/account-security";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { validatePassword } from "@/lib/validation";
import { consumeRateLimit, fingerprintFromRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";
export async function POST(request: Request) {
  const limit = await consumeRateLimit({ key: fingerprintFromRequest(request), action: "reset-password", limit: 8, windowSeconds: 3600 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many attempts." }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const token = String(body.token || "");
  const password = String(body.password || "");
  const passwordError = validatePassword(password);
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 });
  const reset = await consumePasswordResetToken(token);
  if (!reset) return NextResponse.json({ error: "This reset link is invalid or expired." }, { status: 400 });
  const passwordHash = await hashPassword(password);
  await db.$transaction([
    db.user.update({ where: { id: reset.userId }, data: { passwordHash } }),
    db.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } }),
    db.authSession.deleteMany({ where: { userId: reset.userId } }),
  ]);
  return NextResponse.json({ ok: true, redirectTo: "/auth/login?reset=1" });
}
