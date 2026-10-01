"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import {
  createBookingHold,
  getRoomAvailability,
} from "@/lib/booking";
import { expireStaleBookingHolds } from "@/lib/booking-lifecycle";
import { localDateKey } from "@/lib/time";
import { ensureInvoice } from "@/lib/invoices";
import { notifyUser } from "@/lib/notifications";

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



export type MarketplaceQaCheck = {
  name: string;
  ok: boolean;
  detail: string;
};

export type MarketplaceQaState = {
  ok: boolean;
  message: string;
  checks?: MarketplaceQaCheck[];
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


export async function runMarketplaceLifecycleQaAction(
  _previous: MarketplaceQaState,
  _formData: FormData,
): Promise<MarketplaceQaState> {
  await requireRole("ADMIN");

  const checks: MarketplaceQaCheck[] = [];
  const createdBookingIds: string[] = [];
  const createdNotificationIds: string[] = [];

  const add = (name: string, ok: boolean, detail: string) => {
    checks.push({ name, ok, detail });
  };

  try {
    const [owner, creator, studio] = await Promise.all([
      db.user.findUnique({
        where: { email: OWNER_EMAIL },
        select: { id: true, role: true },
      }),
      db.user.findUnique({
        where: { email: CREATOR_EMAIL },
        select: { id: true, role: true },
      }),
      db.studio.findUnique({
        where: { slug: DEMO_SLUGS[0] },
        include: {
          rooms: {
            where: { active: true },
            orderBy: { hourlyRateMad: "asc" },
            take: 1,
          },
        },
      }),
    ]);

    if (!owner || !creator || !studio || !studio.rooms[0]) {
      return {
        ok: false,
        message:
          "Create/reset the demo environment first. QA only runs against the fixed 36 demo accounts and studios.",
        checks,
      };
    }

    add(
      "Demo fixtures",
      owner.role === "STUDIO_OWNER" &&
        creator.role === "CREATOR" &&
        studio.status === "VERIFIED",
      "Verified demo owner, creator and studio are present.",
    );

    const room = studio.rooms[0];
    const durationMinutes = Math.max(60, room.minimumHours * 60);

    let slot: { startAt: string; endAt: string; label: string } | null = null;

    for (let offset = 1; offset <= 21 && !slot; offset += 1) {
      const date = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
      const dateKey = localDateKey(date);
      const available = await getRoomAvailability(
        room.id,
        dateKey,
        durationMinutes,
      );
      if (available[0]) slot = available[0];
    }

    if (!slot) {
      add(
        "Availability",
        false,
        "No future demo slot was available in the next 21 days.",
      );
      return {
        ok: false,
        message: "Lifecycle QA stopped because no demo availability was found.",
        checks,
      };
    }

    add(
      "Availability",
      true,
      "Found a real bookable slot: " + slot.label + ".",
    );

    const confirmed = await createBookingHold({
      creatorId: creator.id,
      roomId: room.id,
      startAt: new Date(slot.startAt),
      durationMinutes,
      paymentMethod: "PAY_AT_STUDIO",
      notes: "[AUTOMATED QA] offline booking lifecycle",
    });
    createdBookingIds.push(confirmed.id);

    const offlinePayment = confirmed.payments.find(
      (payment) => payment.kind === "BALANCE",
    );

    add(
      "Booking creation",
      confirmed.status === "CONFIRMED" &&
        confirmed.paymentStatus === "PENDING" &&
        Boolean(offlinePayment),
      "Offline checkout created a confirmed booking with payment pending.",
    );

    const conversation = await db.conversation.create({
      data: { bookingId: confirmed.id },
    });

    await db.message.createMany({
      data: [
        {
          conversationId: conversation.id,
          senderId: creator.id,
          body: "[AUTOMATED QA] creator message",
        },
        {
          conversationId: conversation.id,
          senderId: owner.id,
          body: "[AUTOMATED QA] owner reply",
        },
      ],
    });

    const messageCount = await db.message.count({
      where: { conversationId: conversation.id },
    });

    add(
      "Messaging",
      messageCount === 2,
      "Creator ↔ owner booking conversation persisted both messages.",
    );

    await db.$transaction(async (tx) => {
      await tx.payment.updateMany({
        where: {
          bookingId: confirmed.id,
          status: "PENDING",
          kind: { in: ["DEPOSIT", "BALANCE"] },
        },
        data: {
          status: "PAID",
          confirmedAt: new Date(),
          confirmedById: owner.id,
        },
      });

      await tx.booking.update({
        where: { id: confirmed.id },
        data: { paymentStatus: "PAID" },
      });
    });

    const paidBooking = await db.booking.findUnique({
      where: { id: confirmed.id },
      include: { payments: true },
    });

    add(
      "Offline payment",
      paidBooking?.paymentStatus === "PAID" &&
        paidBooking.payments
          .filter((payment) =>
            ["DEPOSIT", "BALANCE"].includes(payment.kind),
          )
          .every((payment) => payment.status === "PAID"),
      "Studio receipt confirmation moved the booking to fully paid.",
    );

    const qaEnd = new Date(Date.now() - 30 * 60 * 1000);
    const qaStart = new Date(
      qaEnd.getTime() - durationMinutes * 60 * 1000,
    );

    await db.$transaction([
      db.booking.update({
        where: { id: confirmed.id },
        data: {
          startAt: qaStart,
          endAt: qaEnd,
          status: "COMPLETED",
        },
      }),
      db.payout.updateMany({
        where: { bookingId: confirmed.id, status: "PENDING" },
        data: {
          status: "ELIGIBLE",
          availableAt: new Date(),
        },
      }),
    ]);

    const invoice = await ensureInvoice(confirmed.id);

    add(
      "Invoice",
      Boolean(invoice) &&
        invoice?.bookingId === confirmed.id &&
        invoice.totalMad === confirmed.totalAmountMad,
      "Completed paid booking generated a booking-linked invoice.",
    );

    const notification = await notifyUser({
      userId: creator.id,
      type: "QA_LIFECYCLE",
      title: "36 lifecycle QA notification",
      body: "Automated in-app notification check.",
      href: "/creator/bookings/" + confirmed.id,
    });
    if (notification) createdNotificationIds.push(notification.id);

    const notificationCheck = notification
      ? await db.notification.findUnique({
          where: { id: notification.id },
          include: { deliveries: true },
        })
      : null;

    add(
      "Notification",
      Boolean(notificationCheck) &&
        notificationCheck?.deliveries.some(
          (delivery) =>
            delivery.channel === "IN_APP" &&
            delivery.status === "SENT",
        ) === true,
      "In-app notification and delivery record were created successfully.",
    );

    await db.review.create({
      data: {
        bookingId: confirmed.id,
        creatorId: creator.id,
        studioId: studio.id,
        rating: 5,
        accuracy: 5,
        equipment: 5,
        communication: 5,
        comment: "[AUTOMATED QA] verified lifecycle review",
      },
    });

    const payout = await db.payout.findUnique({
      where: { bookingId: confirmed.id },
    });

    if (payout) {
      await db.payout.update({
        where: { id: payout.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          reference: "QA-LIFECYCLE",
        },
      });
    }

    const completed = await db.booking.findUnique({
      where: { id: confirmed.id },
      include: {
        review: true,
        payout: true,
      },
    });

    add(
      "Completion + review",
      completed?.status === "COMPLETED" &&
        completed.review?.rating === 5,
      "Paid session completed and accepted one verified review.",
    );

    add(
      "Payout",
      completed?.payout?.status === "PAID" &&
        completed.payout.reference === "QA-LIFECYCLE",
      "Payout progressed PENDING → ELIGIBLE → PAID.",
    );

    const hold = await createBookingHold({
      creatorId: creator.id,
      roomId: room.id,
      startAt: new Date(slot.startAt),
      durationMinutes,
      notes: "[AUTOMATED QA] expiring deposit hold",
    });
    createdBookingIds.push(hold.id);

    await db.booking.update({
      where: { id: hold.id },
      data: {
        expiresAt: new Date(Date.now() - 60 * 1000),
      },
    });

    const cleaned = await expireStaleBookingHolds({
      creatorId: creator.id,
      roomId: room.id,
      limit: 50,
    });

    const expired = await db.booking.findUnique({
      where: { id: hold.id },
      include: {
        payments: true,
        payout: true,
      },
    });

    add(
      "Expired hold cleanup",
      cleaned >= 1 &&
        expired?.status === "EXPIRED" &&
        expired.payments.every(
          (payment) =>
            payment.kind === "REFUND" || payment.status === "FAILED",
        ) &&
        expired.payout === null,
      "Expired unpaid deposit hold released inventory, failed pending charges and removed phantom payout.",
    );

    const ok = checks.every((check) => check.ok);

    return {
      ok,
      message: ok
        ? "Marketplace lifecycle QA passed. Temporary QA bookings are removed automatically."
        : "Marketplace lifecycle QA found one or more failures.",
      checks,
    };
  } catch (error) {
    add(
      "Unexpected error",
      false,
      error instanceof Error ? error.message : "Unknown QA failure",
    );

    return {
      ok: false,
      message: "Marketplace lifecycle QA stopped on an unexpected error.",
      checks,
    };
  } finally {
    if (createdNotificationIds.length) {
      await db.notification
        .deleteMany({
          where: { id: { in: createdNotificationIds } },
        })
        .catch(() => undefined);
    }

    if (createdBookingIds.length) {
      await db.booking
        .deleteMany({
          where: { id: { in: createdBookingIds } },
        })
        .catch(() => undefined);
    }
  }
}
