import type { UserRole } from "@prisma/client";

export const PUBLIC_ROLES = ["CREATOR", "STUDIO_OWNER"] as const;

export function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(password: string): string | null {
  if (password.length < 10) return "Password must be at least 10 characters.";
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must contain at least one letter and one number.";
  }
  return null;
}

export function parsePublicRole(value: unknown): UserRole | null {
  if (value === "CREATOR" || value === "STUDIO_OWNER") return value;
  return null;
}
