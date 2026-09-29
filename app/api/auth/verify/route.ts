import { NextResponse } from "next/server";
import { verifyEmailToken } from "@/lib/account-security";
import { consumeRateLimit, fingerprintFromRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const raw = url.searchParams.get("token") || "";
  const limit = await consumeRateLimit({ key: fingerprintFromRequest(request), action: "verify-email", limit: 20, windowSeconds: 3600 });
  if (!limit.allowed) return NextResponse.redirect(new URL("/auth/verify-email?error=rate", request.url));
  if (!raw || !(await verifyEmailToken(raw))) return NextResponse.redirect(new URL("/auth/verify-email?error=token", request.url));
  return NextResponse.redirect(new URL("/dashboard?verified=1", request.url));
}
