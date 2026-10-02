import { NextResponse } from "next/server";

import { createSession, hasCreatorAccess, roleHome } from "@/lib/auth";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { normalizeEmail } from "@/lib/validation";
import { consumeRateLimit, fingerprintFromRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const limit = await consumeRateLimit({ key: fingerprintFromRequest(request), action: "login-rate-limit", limit: 12, windowSeconds: 900 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many login attempts. Try again shortly." }, { status: 429 });
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid request." },
      { status: 400 },
    );
  }

  const email = normalizeEmail(body.email);
  const password = String(body.password ?? "");
  const requestedNext = String(body.nextTo ?? "");
  const safeNext = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "";

  const user = await db.user.findUnique({ where: { email } });

  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return NextResponse.json(
      { error: "Incorrect email or password." },
      { status: 401 },
    );
  }

  if (user.status !== "ACTIVE") {
    return NextResponse.json(
      { error: "This account is not active." },
      { status: 403 },
    );
  }

  await createSession(user.id);

  return NextResponse.json({
    ok: true,
    redirectTo: !user.emailVerifiedAt ? "/auth/verify-email" : (hasCreatorAccess(user.role) && safeNext ? safeNext : roleHome(user.role)),
    user: {
      id: user.id,
      name: user.name,
      role: user.role,
    },
  });
}
