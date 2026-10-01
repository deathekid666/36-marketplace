"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";

export type DemoSetupState = {
  ok: boolean;
  message: string;
  ownerEmail?: string;
  ownerPassword?: string;
  creatorEmail?: string;
  creatorPassword?: string;
  studioUrl?: string;
};

const OWNER_EMAIL = "demo-owner@36.local";
const CREATOR_EMAIL = "demo-creator@36.local";
const STUDIO_SLUG = "36-demo-studio";

function demoPassword() {
  return (
    "36!" +
    randomBytes(12).toString("base64url") +
    "Aa9"
  );
}

export async function setupDemoMarketplaceAction(
  _previous: DemoSetupState,
  _formData: FormData,
): Promise<DemoSetupState> {
  await requireRole("ADMIN");

  const ownerPassword = demoPassword();
  const creatorPassword = demoPassword();
  const [ownerHash, creatorHash] = await Promise.all([
    hashPassword(ownerPassword),
    hashPassword(creatorPassword),
  ]);
  const verifiedAt = new Date();

  const owner = await db.user.upsert({
    where: { email: OWNER_EMAIL },
    create: {
      email: OWNER_EMAIL,
      name: "36 Demo Studio Owner",
      passwordHash: ownerHash,
      role: "STUDIO_OWNER",
      status: "ACTIVE",
      emailVerifiedAt: verifiedAt,
      referralCode: "36-DEMOOWNER",
    },
    update: {
      name: "36 Demo Studio Owner",
      passwordHash: ownerHash,
      role: "STUDIO_OWNER",
      status: "ACTIVE",
      emailVerifiedAt: verifiedAt,
    },
  });

  await db.user.upsert({
    where: { email: CREATOR_EMAIL },
    create: {
      email: CREATOR_EMAIL,
      name: "36 Demo Creator",
      passwordHash: creatorHash,
      role: "CREATOR",
      status: "ACTIVE",
      emailVerifiedAt: verifiedAt,
      referralCode: "36-DEMOCREATOR",
    },
    update: {
      name: "36 Demo Creator",
      passwordHash: creatorHash,
      role: "CREATOR",
      status: "ACTIVE",
      emailVerifiedAt: verifiedAt,
    },
  });

  await db.studio.deleteMany({
    where: { slug: STUDIO_SLUG },
  });

  await db.studio.create({
    data: {
      ownerId: owner.id,
      name: "36 Demo Studio (Test Listing)",
      slug: STUDIO_SLUG,
      description:
        "Controlled 36 marketplace test listing. This is not a real commercial studio. Use it to test availability, offline payment, owner operations, booking completion and verified reviews end to end.",
      primaryCategory: "RECORDING",
      city: "Casablanca",
      neighborhood: "Demo Area",
      address: "Demo location — Casablanca",
      latitude: 33.5731,
      longitude: -7.5898,
      phone: "+212600000000",
      website: "",
      instagram: "",
      status: "VERIFIED",
      verifiedAt,
      depositPercent: 30,
      freeCancellationHours: 24,
      commissionBps: 1200,
      taxRateBps: 0,
      photos: {
        create: [
          {
            url: "/demo-studio-room.svg",
            alt: "36 demo studio control room illustration",
            sortOrder: 0,
          },
        ],
      },
      amenities: {
        create: [
          { name: "Demo Wi-Fi" },
          { name: "Demo air conditioning" },
          { name: "Demo lounge" },
        ],
      },
      openingHours: {
        create: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          dayOfWeek,
          opensAt: "10:00",
          closesAt: "22:00",
          closed: false,
        })),
      },
      rooms: {
        create: [
          {
            name: "Demo Control Room",
            description:
              "Test room for the complete 36 booking workflow.",
            category: "RECORDING",
            hourlyRateMad: 250,
            minimumHours: 1,
            capacity: 4,
            engineerIncluded: true,
            active: true,
            equipment: {
              create: [
                { name: "Demo condenser microphone", quantity: 2 },
                { name: "Demo audio interface", quantity: 1 },
                { name: "Demo studio monitors", quantity: 2 },
              ],
            },
          },
        ],
      },
      addons: {
        create: [
          {
            name: "Demo engineer assistance",
            description: "Test add-on for checkout.",
            unitPriceMad: 100,
            unitLabel: "session",
            active: true,
          },
        ],
      },
    },
  });

  revalidatePath("/studios");
  revalidatePath("/admin");
  revalidatePath("/admin/test-marketplace");

  return {
    ok: true,
    message:
      "Demo owner, creator and verified studio were created/reset. Passwords are shown only in this response.",
    ownerEmail: OWNER_EMAIL,
    ownerPassword,
    creatorEmail: CREATOR_EMAIL,
    creatorPassword,
    studioUrl: "/studios/" + STUDIO_SLUG,
  };
}

export async function removeDemoMarketplaceAction() {
  await requireRole("ADMIN");

  await db.user.deleteMany({
    where: {
      email: { in: [OWNER_EMAIL, CREATOR_EMAIL] },
    },
  });

  revalidatePath("/studios");
  revalidatePath("/admin");
  revalidatePath("/admin/test-marketplace");
}
