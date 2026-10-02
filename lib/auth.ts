import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User, UserRole } from "@prisma/client";

import { db } from "@/lib/db";

const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || "36_session";
const TTL_DAYS = Math.max(1, Number(process.env.SESSION_TTL_DAYS || "30"));

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);

  await db.authSession.create({
    data: { userId, tokenHash, expiresAt },
  });

  const store = await cookies();
  store.set(COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function deleteCurrentSession(): Promise<void> {
  const store = await cookies();
  const rawToken = store.get(COOKIE_NAME)?.value;

  if (rawToken) {
    await db.authSession.deleteMany({
      where: { tokenHash: hashToken(rawToken) },
    });
  }

  store.delete(COOKIE_NAME);
}

export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const rawToken = store.get(COOKIE_NAME)?.value;
  if (!rawToken) return null;

  const session = await db.authSession.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt <= new Date()) {
    return null;
  }

  if (session.user.status !== "ACTIVE") return null;
  return session.user;
}

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<User> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}

export async function requireVerifiedRole(...roles: UserRole[]): Promise<User> {
  const user = await requireRole(...roles);
  if (!user.emailVerifiedAt) redirect("/auth/verify-email");
  return user;
}

export function hasCreatorAccess(role: UserRole): boolean {
  return role === "CREATOR" || role === "STUDIO_OWNER";
}

export async function requireCreatorAccess(): Promise<User> {
  return requireRole("CREATOR", "STUDIO_OWNER");
}

export async function requireVerifiedCreatorAccess(): Promise<User> {
  const user = await requireCreatorAccess();
  if (!user.emailVerifiedAt) redirect("/auth/verify-email");
  return user;
}

export function roleHome(role: UserRole): string {
  if (role === "ADMIN") return "/admin";
  if (role === "STUDIO_OWNER") return "/owner";
  return "/creator";
}
