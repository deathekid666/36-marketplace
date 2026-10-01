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
  studioUrls?: Array<{ name: string; url: string }>;
  compareUrl?: string;
};

const OWNER_EMAIL = "demo-owner@36.local";
const CREATOR_EMAIL = "demo-creator@36.local";
const DEMO_SLUGS = [
  "36-demo-budget-recording",
  "36-demo-premium-production",
  "36-demo-podcast-content",
] as const;
const LEGACY_DEMO_SLUG = "36-demo-studio";

function demoPassword() {
  return "36!" + randomBytes(12).toString("base64url") + "Aa9";
}

function openingHours(
  opensAt: string,
  closesAt: string,
  closedDays: number[] = [],
) {
  return Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek,
    opensAt,
    closesAt,
    closed: closedDays.includes(dayOfWeek),
  }));
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
    where: {
      slug: { in: [...DEMO_SLUGS, LEGACY_DEMO_SLUG] },
    },
  });

  const budget = await db.studio.create({
    data: {
      ownerId: owner.id,
      name: "36 Demo Budget Recording",
      slug: DEMO_SLUGS[0],
      description:
        "Controlled 36 test listing for budget recording searches. Not a real business.",
      primaryCategory: "RECORDING",
      city: "Casablanca",
      neighborhood: "Demo Centre",
      address: "Controlled demo location A — Casablanca",
      latitude: 33.5731,
      longitude: -7.5898,
      phone: "",
      website: "",
      instagram: "",
      status: "VERIFIED",
      verifiedAt,
      depositPercent: 30,
      freeCancellationHours: 12,
      commissionBps: 1200,
      taxRateBps: 0,
      photos: {
        create: [
          {
            url: "/demo-budget-studio.svg",
            alt: "36 demo budget recording studio illustration",
            sortOrder: 0,
          },
        ],
      },
      amenities: {
        create: [
          { name: "Wi-Fi" },
          { name: "Air conditioning" },
        ],
      },
      openingHours: {
        create: openingHours("10:00", "21:00"),
      },
      rooms: {
        create: [
          {
            name: "Budget Vocal Room",
            description: "Compact demo room for filter and booking QA.",
            category: "RECORDING",
            hourlyRateMad: 120,
            minimumHours: 1,
            capacity: 2,
            engineerIncluded: false,
            active: true,
            equipment: {
              create: [
                { name: "USB microphone", quantity: 1 },
                { name: "Audio interface", quantity: 1 },
                { name: "Headphones", quantity: 2 },
              ],
            },
          },
        ],
      },
      addons: {
        create: [
          {
            name: "Demo engineer assistance",
            description: "Optional test add-on.",
            unitPriceMad: 80,
            unitLabel: "session",
            active: true,
          },
        ],
      },
    },
  });

  const premium = await db.studio.create({
    data: {
      ownerId: owner.id,
      name: "36 Demo Premium Production",
      slug: DEMO_SLUGS[1],
      description:
        "Controlled 36 premium production test listing with larger capacity, premium equipment and engineer inclusion. Not a real business.",
      primaryCategory: "PRODUCTION",
      city: "Casablanca",
      neighborhood: "Demo Maarif",
      address: "Controlled demo location B — Casablanca",
      latitude: 33.5842,
      longitude: -7.6327,
      phone: "",
      website: "",
      instagram: "",
      status: "VERIFIED",
      verifiedAt,
      depositPercent: 30,
      freeCancellationHours: 48,
      commissionBps: 1200,
      taxRateBps: 0,
      photos: {
        create: [
          {
            url: "/demo-premium-studio.svg",
            alt: "36 demo premium production studio illustration",
            sortOrder: 0,
          },
        ],
      },
      amenities: {
        create: [
          { name: "Wi-Fi" },
          { name: "Air conditioning" },
          { name: "Parking" },
          { name: "Lounge" },
        ],
      },
      openingHours: {
        create: openingHours("09:00", "23:00", [0]),
      },
      rooms: {
        create: [
          {
            name: "Premium Control Room",
            description: "High-end demo production room.",
            category: "PRODUCTION",
            hourlyRateMad: 450,
            minimumHours: 2,
            capacity: 8,
            engineerIncluded: true,
            active: true,
            equipment: {
              create: [
                { name: "Neumann U87", quantity: 1 },
                { name: "Apollo interface", quantity: 1 },
                { name: "Studio monitors", quantity: 2 },
                { name: "88-key piano", quantity: 1 },
              ],
            },
          },
          {
            name: "Premium Video Room",
            description: "Second room used to test multi-room comparison.",
            category: "VIDEO",
            hourlyRateMad: 600,
            minimumHours: 2,
            capacity: 12,
            engineerIncluded: true,
            active: true,
            equipment: {
              create: [
                { name: "4K camera", quantity: 2 },
                { name: "LED lighting kit", quantity: 1 },
                { name: "Green screen", quantity: 1 },
              ],
            },
          },
        ],
      },
      addons: {
        create: [
          {
            name: "Premium mix engineer",
            description: "Test premium add-on.",
            unitPriceMad: 250,
            unitLabel: "session",
            active: true,
          },
        ],
      },
    },
  });

  const podcast = await db.studio.create({
    data: {
      ownerId: owner.id,
      name: "36 Demo Podcast & Content",
      slug: DEMO_SLUGS[2],
      description:
        "Controlled 36 podcast and content test listing with multi-person capacity and creator-focused equipment. Not a real business.",
      primaryCategory: "PODCAST",
      city: "Casablanca",
      neighborhood: "Demo Gauthier",
      address: "Controlled demo location C — Casablanca",
      latitude: 33.5922,
      longitude: -7.6201,
      phone: "",
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
            url: "/demo-podcast-studio.svg",
            alt: "36 demo podcast content studio illustration",
            sortOrder: 0,
          },
        ],
      },
      amenities: {
        create: [
          { name: "Wi-Fi" },
          { name: "Green room" },
          { name: "Coffee" },
        ],
      },
      openingHours: {
        create: openingHours("08:00", "20:00"),
      },
      rooms: {
        create: [
          {
            name: "Podcast Table",
            description: "Demo podcast room for creator workflow QA.",
            category: "PODCAST",
            hourlyRateMad: 220,
            minimumHours: 1,
            capacity: 5,
            engineerIncluded: true,
            active: true,
            equipment: {
              create: [
                { name: "Shure SM7B", quantity: 4 },
                { name: "Podcast mixer", quantity: 1 },
                { name: "4K camera", quantity: 2 },
                { name: "LED lighting kit", quantity: 1 },
              ],
            },
          },
        ],
      },
      addons: {
        create: [
          {
            name: "Demo video edit",
            description: "Test post-production add-on.",
            unitPriceMad: 180,
            unitLabel: "session",
            active: true,
          },
        ],
      },
    },
  });

  const studioUrls = [
    { name: budget.name, url: "/studios/" + budget.slug },
    { name: premium.name, url: "/studios/" + premium.slug },
    { name: podcast.name, url: "/studios/" + podcast.slug },
  ];

  const compareParams = new URLSearchParams();
  compareParams.set(
    "ids",
    [budget.id, premium.id, podcast.id].join(","),
  );
  compareParams.set("duration", "1");

  revalidatePath("/studios");
  revalidatePath("/studios/compare");
  revalidatePath("/admin");
  revalidatePath("/admin/test-marketplace");

  return {
    ok: true,
    message:
      "Demo owner, creator and 3 verified demo studios were created/reset. Passwords are shown only in this response.",
    ownerEmail: OWNER_EMAIL,
    ownerPassword,
    creatorEmail: CREATOR_EMAIL,
    creatorPassword,
    studioUrls,
    compareUrl: "/studios/compare?" + compareParams.toString(),
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
  revalidatePath("/studios/compare");
  revalidatePath("/admin");
  revalidatePath("/admin/test-marketplace");
}
