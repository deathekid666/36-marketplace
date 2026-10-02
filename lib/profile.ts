import type { UserRole } from "@prisma/client";

export function profileRoleLabel(role: UserRole) {
  if (role === "STUDIO_OWNER") return "Creator · Studio Host";
  if (role === "CREATOR") return "Creator";
  return "36 Admin";
}

export function profileInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function memberSinceLabel(value: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
}

export function yearsSince(value: Date) {
  const now = new Date();
  let years = now.getUTCFullYear() - value.getUTCFullYear();
  const anniversary = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
    ),
  );
  if (anniversary > now) years -= 1;
  return Math.max(0, years);
}
