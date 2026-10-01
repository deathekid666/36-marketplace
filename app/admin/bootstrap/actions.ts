"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";

import { createSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import {
  normalizeEmail,
  validateEmail,
  validatePassword,
} from "@/lib/validation";

const BOOTSTRAP_TOKEN_HASH =
  "3df57cf3eb30b4cb423935119ec6fb5f44aabbfa346a6945105486802b3882ab";
const BOOTSTRAP_KEY_HASH =
  "36-admin-bootstrap-v1";
const BOOTSTRAP_ACTION =
  "admin-bootstrap-single-use";
const BOOTSTRAP_WINDOW_START =
  new Date("2000-01-01T00:00:00.000Z");

export type AdminBootstrapState = {
  ok: boolean;
  message: string;
};

function validBootstrapToken(value: string) {
  const actual = createHash("sha256")
    .update(value)
    .digest();
  const expected = Buffer.from(
    BOOTSTRAP_TOKEN_HASH,
    "hex",
  );

  return (
    actual.length === expected.length &&
    timingSafeEqual(actual, expected)
  );
}

export async function bootstrapAdminAction(
  _previous: AdminBootstrapState,
  formData: FormData,
): Promise<AdminBootstrapState> {
  const token = String(formData.get("token") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const email = normalizeEmail(formData.get("email"));
  const password = String(formData.get("password") || "");
  const confirmPassword = String(
    formData.get("confirmPassword") || "",
  );

  if (!validBootstrapToken(token)) {
    return {
      ok: false,
      message:
        "Bootstrap token is invalid or this bootstrap is no longer available.",
    };
  }

  if (name.length < 2 || name.length > 100) {
    return {
      ok: false,
      message: "Enter a valid admin name.",
    };
  }

  if (!validateEmail(email)) {
    return {
      ok: false,
      message: "Enter a valid admin email.",
    };
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    return {
      ok: false,
      message: passwordError,
    };
  }

  if (password !== confirmPassword) {
    return {
      ok: false,
      message: "Passwords do not match.",
    };
  }

  const passwordHash = await hashPassword(password);
  let adminId = "";

  try {
    adminId = await db.$transaction(async (tx) => {
      try {
        await tx.rateLimitWindow.create({
          data: {
            keyHash: BOOTSTRAP_KEY_HASH,
            action: BOOTSTRAP_ACTION,
            windowStart: BOOTSTRAP_WINDOW_START,
            count: 1,
          },
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2002"
        ) {
          throw new Error("ADMIN_BOOTSTRAP_ALREADY_USED");
        }
        throw error;
      }

      const existing = await tx.user.findUnique({
        where: { email },
        select: { id: true },
      });

      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              name,
              passwordHash,
              role: "ADMIN",
              status: "ACTIVE",
              emailVerifiedAt: new Date(),
            },
          })
        : await tx.user.create({
            data: {
              name,
              email,
              passwordHash,
              role: "ADMIN",
              status: "ACTIVE",
              emailVerifiedAt: new Date(),
            },
          });

      if (!user.referralCode) {
        await tx.user.update({
          where: { id: user.id },
          data: {
            referralCode:
              "36-" +
              user.id
                .replaceAll("-", "")
                .slice(0, 8)
                .toUpperCase(),
          },
        });
      }

      await tx.marketplaceEvent.create({
        data: {
          eventType: "ADMIN_BOOTSTRAP_USED",
          userId: user.id,
          metadata: {
            version: 1,
            email,
          },
        },
      });

      return user.id;
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "ADMIN_BOOTSTRAP_ALREADY_USED"
    ) {
      return {
        ok: false,
        message:
          "This one-time admin bootstrap has already been used.",
      };
    }

    console.error("admin-bootstrap-error", {
      message:
        error instanceof Error
          ? error.message
          : "UNKNOWN_ERROR",
    });

    return {
      ok: false,
      message:
        "Unable to create the admin account. Nothing was changed.",
    };
  }

  await createSession(adminId);
  redirect("/admin?bootstrapped=1");
}
