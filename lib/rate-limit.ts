import { createHash } from "node:crypto";
import { db } from "@/lib/db";

export type RateLimitResult = { allowed: boolean; remaining: number; resetAt: Date };

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function fingerprintFromRequest(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || request.headers.get("x-real-ip") || "unknown";
  const ua = request.headers.get("user-agent") || "unknown";
  return hash(`${ip}|${ua}`);
}

export async function consumeRateLimit(input: {
  key: string;
  action: string;
  limit: number;
  windowSeconds: number;
}): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = input.windowSeconds * 1000;
  const windowStartMs = Math.floor(now / windowMs) * windowMs;
  const windowStart = new Date(windowStartMs);
  const resetAt = new Date(windowStartMs + windowMs);
  const keyHash = hash(input.key);

  const row = await db.rateLimitWindow.upsert({
    where: { keyHash_action_windowStart: { keyHash, action: input.action, windowStart } },
    create: { keyHash, action: input.action, windowStart, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true },
  });

  return {
    allowed: row.count <= input.limit,
    remaining: Math.max(0, input.limit - row.count),
    resetAt,
  };
}
