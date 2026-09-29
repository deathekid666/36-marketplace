import { NextResponse } from "next/server";

import { createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { issueEmailVerification } from "@/lib/account-security";
import { consumeRateLimit, fingerprintFromRequest } from "@/lib/rate-limit";
import {
  normalizeEmail,
  parsePublicRole,
  validateEmail,
  validatePassword,
} from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = await consumeRateLimit({ key: fingerprintFromRequest(request), action: "signup-rate-limit", limit: 5, windowSeconds: 3600 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many signup attempts. Try again later." }, { status: 429 });
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  const role = parsePublicRole(body.role);
  const referralCodeInput = String(body.referralCode ?? "").trim().toUpperCase().slice(0, 32);

  if (name.length < 2 || name.length > 100) {
    return NextResponse.json(
      { error: "Enter a valid name." },
      { status: 400 },
    );
  }

  if (!validateEmail(email)) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
      { status: 400 },
    );
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return NextResponse.json({ error: passwordError }, { status: 400 });
  }

  if (!role) {
    return NextResponse.json(
      { error: "Choose Creator or Studio Owner." },
      { status: 400 },
    );
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists." },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);

  const user = await db.user.create({
    data: { name, email, passwordHash, role },
  });
  const ownReferralCode = `36-${user.id.replaceAll("-", "").slice(0, 8).toUpperCase()}`;
  await db.user.update({ where: { id: user.id }, data: { referralCode: ownReferralCode } });
  if (referralCodeInput) {
    const inviter = await db.user.findUnique({ where: { referralCode: referralCodeInput }, select: { id: true } });
    if (inviter && inviter.id !== user.id) {
      await db.referral.create({ data: { inviterId: inviter.id, inviteeId: user.id, code: referralCodeInput, rewardMad: Math.max(0, Number(process.env.REFERRAL_REWARD_MAD || "50")) } }).catch(() => undefined);
    }
  }

  await createSession(user.id);
  await issueEmailVerification(user.id).catch(() => undefined);

  return NextResponse.json(
    {
      ok: true,
      redirectTo: "/auth/verify-email",
      user: {
        id: user.id,
        name: user.name,
        role: user.role,
      },
    },
    { status: 201 },
  );
}
