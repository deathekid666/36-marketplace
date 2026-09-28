import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { sendTransactionalEmail } from "@/lib/email";

function tokenHash(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export async function issueEmailVerification(userId: string) {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, emailVerifiedAt: true } });
  if (!user || user.emailVerifiedAt) return;
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await db.emailVerificationToken.deleteMany({ where: { userId, usedAt: null } });
  await db.emailVerificationToken.create({ data: { userId, tokenHash: tokenHash(raw), expiresAt } });
  await sendTransactionalEmail({
    to: user.email,
    subject: "Verify your 36 account",
    title: "Verify your email",
    body: `Hi ${user.name}, confirm this email address to unlock bookings, studio submissions and marketplace transactions.`,
    href: `/api/auth/verify?token=${encodeURIComponent(raw)}`,
    cta: "Verify email",
  });
}

export async function verifyEmailToken(raw: string) {
  const hash = tokenHash(raw);
  return db.$transaction(async (tx) => {
    const token = await tx.emailVerificationToken.findUnique({ where: { tokenHash: hash } });
    if (!token || token.usedAt || token.expiresAt <= new Date()) return false;
    await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: new Date() } });
    await tx.emailVerificationToken.update({ where: { id: token.id }, data: { usedAt: new Date() } });
    return true;
  });
}

export async function issuePasswordReset(email: string) {
  const user = await db.user.findUnique({ where: { email: email.trim().toLowerCase() }, select: { id: true, email: true, name: true } });
  if (!user) return;
  const raw = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });
  await db.passwordResetToken.create({ data: { userId: user.id, tokenHash: tokenHash(raw), expiresAt } });
  await sendTransactionalEmail({
    to: user.email,
    subject: "Reset your 36 password",
    title: "Password reset",
    body: `Hi ${user.name}, use this link within one hour to choose a new password. If you didn't request this, you can ignore the message.`,
    href: `/auth/reset-password?token=${encodeURIComponent(raw)}`,
    cta: "Reset password",
  });
}

export async function consumePasswordResetToken(raw: string) {
  const hash = tokenHash(raw);
  return db.passwordResetToken.findFirst({ where: { tokenHash: hash, usedAt: null, expiresAt: { gt: new Date() } } });
}
