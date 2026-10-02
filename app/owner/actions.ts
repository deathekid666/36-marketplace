"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { StudioCategory } from "@prisma/client";

import { requireRole, requireVerifiedRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";
import {
  currencyForCountry,
  normalizeCountryCode,
  normalizeCurrency,
} from "@/lib/commerce";
import {
  DAYS,
  STUDIO_CATEGORIES,
  slugify,
  studioCompletion,
  studioOnboardingChecklist,
} from "@/lib/studio";
import {
  marketplaceDateTimeLocalToUtc,
  studioTimeZone,
  timeZoneForCoordinates,
} from "@/lib/time";
import {
  deleteManagedMarketplaceStudioPhotos,
  isManagedMarketplaceStudioPhotoUrl,
} from "@/lib/discovery/studio-photo-storage";

function text(form: FormData, name: string, max = 1000) {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

function positiveInt(value: FormDataEntryValue | null, fallback = 1) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.round(n);
}

function optionalNumber(value: FormDataEntryValue | null, min: number, max: number) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function parseCategory(value: unknown): StudioCategory {
  const raw = String(value ?? "");
  return STUDIO_CATEGORIES.some((x) => x.value === raw)
    ? (raw as StudioCategory)
    : "RECORDING";
}

async function ownerStudio(studioId: string, ownerId: string) {
  return db.studio.findFirst({ where: { id: studioId, ownerId } });
}

async function markListingDirty(studioId: string) {
  const current = await db.studio.findUnique({ where: { id: studioId }, select: { status: true } });
  if (!current || current.status === "SUSPENDED" || current.status === "DRAFT") return;
  await db.studio.update({
    where: { id: studioId },
    data: { status: "DRAFT", submittedAt: null, verifiedAt: null, verificationNote: "" },
  });
}

async function uniqueSlug(name: string) {
  const base = slugify(name);
  let slug = base;
  let i = 1;
  while (await db.studio.findUnique({ where: { slug }, select: { id: true } })) {
    i += 1;
    slug = `${base}-${i}`;
  }
  return slug;
}

export async function createStudioAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const name = text(form, "name", 120);
  if (name.length < 3) return;
  const slug = await uniqueSlug(name);
  const studio = await db.studio.create({
    data: {
      ownerId: user.id,
      name,
      slug,
      primaryCategory: parseCategory(form.get("primaryCategory")),
      city: text(form, "city", 80) || "Casablanca",
      neighborhood: text(form, "neighborhood", 100),
    },
  });
  redirect(`/owner/studios/${studio.id}`);
}


export async function createStudioWizardAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");

  const name = text(form, "name", 120);
  const description = text(form, "description", 5000);
  const primaryCategory = parseCategory(form.get("primaryCategory"));
  const city = text(form, "city", 80);
  const neighborhood = text(form, "neighborhood", 100);
  const address = text(form, "address", 300);
  const phone = text(form, "phone", 40);
  const instagram = text(form, "instagram", 200);
  const website = text(form, "website", 300);
  const latitude = optionalNumber(form.get("latitude"), -90, 90);
  const longitude = optionalNumber(form.get("longitude"), -180, 180);
  const countryCode = normalizeCountryCode(form.get("countryCode"));
  const requestedCurrency = normalizeCurrency(
    form.get("currency"),
    currencyForCountry(countryCode),
  );

  const roomName = text(form, "roomName", 120);
  const roomDescription = text(form, "roomDescription", 1500);
  const roomCategory = parseCategory(form.get("roomCategory"));
  const hourlyRateMad = positiveInt(form.get("hourlyRateMad"), 100);
  const minimumHours = positiveInt(form.get("minimumHours"), 1);
  const capacity = positiveInt(form.get("capacity"), 1);
  const engineerIncluded = form.get("engineerIncluded") === "on";

  const depositPercent = Math.max(
    0,
    Math.min(100, Math.round(Number(form.get("depositPercent")) || 30)),
  );
  const freeCancellationHours = Math.max(
    0,
    Math.min(336, Math.round(Number(form.get("freeCancellationHours")) || 24)),
  );

  if (
    name.length < 3 ||
    description.length < 40 ||
    !city ||
    !address ||
    !phone ||
    latitude == null ||
    longitude == null ||
    !countryCode ||
    roomName.length < 2 ||
    hourlyRateMad < 1 ||
    minimumHours < 1 ||
    capacity < 1
  ) {
    redirect("/owner/studios/new?error=incomplete");
  }

  const allowedAmenities = new Set([
    "Wi-Fi",
    "Air conditioning",
    "Parking",
    "Waiting area",
    "Kitchen",
    "Restroom",
    "Wheelchair access",
    "Natural light",
    "Soundproofing",
    "Engineer available",
    "24/7 access",
    "Freight elevator",
  ]);

  const amenities = Array.from(
    new Set(
      form
        .getAll("amenities")
        .map((value) => String(value).trim())
        .filter((value) => allowedAmenities.has(value)),
    ),
  ).slice(0, 20);

  const equipment = Array.from(
    new Set(
      text(form, "equipment", 1800)
        .split(/[\n,;]+/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ).slice(0, 40);

  const schedulePreset = text(form, "schedulePreset", 40);
  const schedule =
    schedulePreset === "WEEKDAYS"
      ? DAYS.map((_, dayOfWeek) => ({
          dayOfWeek,
          opensAt: "09:00",
          closesAt: "18:00",
          closed: dayOfWeek >= 5,
        }))
      : schedulePreset === "EVERYDAY"
        ? DAYS.map((_, dayOfWeek) => ({
            dayOfWeek,
            opensAt: "09:00",
            closesAt: "22:00",
            closed: false,
          }))
        : DAYS.map((_, dayOfWeek) => ({
            dayOfWeek,
            opensAt: "09:00",
            closesAt: "22:00",
            closed: dayOfWeek === 6,
          }));

  const slug = await uniqueSlug(name);
  const currency = requestedCurrency;
  const timeZone = timeZoneForCoordinates(latitude, longitude);

  const studio = await db.$transaction(async (tx) => {
    const created = await tx.studio.create({
      data: {
        ownerId: user.id,
        name,
        slug,
        description,
        primaryCategory,
        city,
        neighborhood,
        address,
        countryCode,
        currency,
        timeZone,
        phone,
        instagram,
        website,
        latitude,
        longitude,
        depositPercent,
        freeCancellationHours,
      },
    });

    const room = await tx.room.create({
      data: {
        studioId: created.id,
        name: roomName,
        description: roomDescription,
        category: roomCategory,
        hourlyRateMad,
        minimumHours,
        capacity,
        engineerIncluded,
        active: true,
      },
    });

    if (equipment.length) {
      await tx.roomEquipment.createMany({
        data: equipment.map((item) => ({
          roomId: room.id,
          name: item.slice(0, 120),
          quantity: 1,
        })),
        skipDuplicates: true,
      });
    }

    if (amenities.length) {
      await tx.studioAmenity.createMany({
        data: amenities.map((item) => ({
          studioId: created.id,
          name: item,
        })),
        skipDuplicates: true,
      });
    }

    await tx.openingHour.createMany({
      data: schedule.map((item) => ({
        studioId: created.id,
        ...item,
      })),
    });

    return created;
  });

  revalidatePath("/owner");
  revalidatePath("/owner/studios");
  redirect(`/owner/studios/${studio.id}?onboarding=created#media`);
}

export async function updateStudioAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const studio = await ownerStudio(studioId, user.id);
  if (!studio) return;

  const nextLatitude = optionalNumber(form.get("latitude"), -90, 90);
  const nextLongitude = optionalNumber(form.get("longitude"), -180, 180);
  const nextCountryCode =
    normalizeCountryCode(form.get("countryCode"), studio.countryCode || "MA") ||
    studio.countryCode ||
    "MA";

  await db.studio.update({
    where: { id: studio.id },
    data: {
      name: text(form, "name", 120) || studio.name,
      description: text(form, "description", 5000),
      primaryCategory: parseCategory(form.get("primaryCategory")),
      city: text(form, "city", 80) || "Casablanca",
      neighborhood: text(form, "neighborhood", 100),
      address: text(form, "address", 300),
      phone: text(form, "phone", 40),
      instagram: text(form, "instagram", 200),
      website: text(form, "website", 300),
      countryCode: nextCountryCode,
      latitude: nextLatitude,
      longitude: nextLongitude,
      timeZone: timeZoneForCoordinates(
        nextLatitude,
        nextLongitude,
        studio.timeZone,
      ),
      depositPercent: Math.max(0, Math.min(100, Math.round(Number(form.get("depositPercent")) || 0))),
      freeCancellationHours: Math.max(0, Math.min(336, Math.round(Number(form.get("freeCancellationHours")) || 24))),
      legalName: text(form, "legalName", 180),
      ice: text(form, "ice", 80),
      taxId: text(form, "taxId", 80),
      taxRateBps: Math.max(0, Math.min(3000, Math.round((Number(form.get("taxRatePercent")) || 0) * 100))),
      status: studio.status === "SUSPENDED" ? "SUSPENDED" : "DRAFT",
      submittedAt: studio.status === "SUSPENDED" ? studio.submittedAt : null,
      verifiedAt: studio.status === "SUSPENDED" ? studio.verifiedAt : null,
      verificationNote: studio.status === "SUSPENDED" ? studio.verificationNote : "",
    },
  });
  revalidatePath(`/owner/studios/${studio.id}`);
  revalidatePath("/owner");
}

export async function addRoomAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const studio = await ownerStudio(studioId, user.id);
  if (!studio || studio.status === "SUSPENDED") return;

  const name = text(form, "name", 120);
  if (name.length < 2) return;

  await markListingDirty(studioId);
  await db.room.create({
    data: {
      studioId,
      name,
      description: text(form, "description", 1500),
      category: parseCategory(form.get("category")),
      hourlyRateMad: positiveInt(form.get("hourlyRateMad"), 100),
      minimumHours: positiveInt(form.get("minimumHours"), 1),
      capacity: positiveInt(form.get("capacity"), 1),
      engineerIncluded: form.get("engineerIncluded") === "on",
    },
  });
  revalidatePath(`/owner/studios/${studioId}`);
}

export async function addEquipmentAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const roomId = text(form, "roomId", 80);
  const room = await db.room.findFirst({
    where: { id: roomId, studio: { ownerId: user.id, id: studioId } },
  });
  if (!room) return;
  const name = text(form, "name", 120);
  if (!name) return;
  await markListingDirty(studioId);
  await db.roomEquipment.upsert({
    where: { roomId_name: { roomId, name } },
    create: { roomId, name, quantity: positiveInt(form.get("quantity"), 1) },
    update: { quantity: positiveInt(form.get("quantity"), 1) },
  });
  revalidatePath(`/owner/studios/${studioId}`);
}

export async function addPhotoAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const studio = await ownerStudio(studioId, user.id);
  if (!studio) return;
  const url = text(form, "url", 1000);
  if (!/^https?:\/\//i.test(url)) return;
  await markListingDirty(studioId);
  await db.studioPhoto.create({
    data: {
      studioId,
      url,
      alt: text(form, "alt", 200),
      sortOrder: Math.max(0, Number(form.get("sortOrder")) || 0),
    },
  });
  revalidatePath(`/owner/studios/${studioId}`);
}

export async function addAmenityAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const studio = await ownerStudio(studioId, user.id);
  if (!studio) return;
  const name = text(form, "name", 100);
  if (!name) return;
  await markListingDirty(studioId);
  await db.studioAmenity.upsert({
    where: { studioId_name: { studioId, name } },
    create: { studioId, name },
    update: {},
  });
  revalidatePath(`/owner/studios/${studioId}`);
}

export async function saveOpeningHoursAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const studio = await ownerStudio(studioId, user.id);
  if (!studio) return;

  await markListingDirty(studioId);
  await db.$transaction(
    DAYS.map((_, dayOfWeek) =>
      db.openingHour.upsert({
        where: { studioId_dayOfWeek: { studioId, dayOfWeek } },
        create: {
          studioId,
          dayOfWeek,
          opensAt: text(form, `open_${dayOfWeek}`, 5) || "09:00",
          closesAt: text(form, `close_${dayOfWeek}`, 5) || "22:00",
          closed: form.get(`closed_${dayOfWeek}`) === "on",
        },
        update: {
          opensAt: text(form, `open_${dayOfWeek}`, 5) || "09:00",
          closesAt: text(form, `close_${dayOfWeek}`, 5) || "22:00",
          closed: form.get(`closed_${dayOfWeek}`) === "on",
        },
      }),
    ),
  );
  revalidatePath(`/owner/studios/${studioId}`);
}

export async function addBlockedSlotAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const roomId = text(form, "roomId", 80);
  const room = await db.room.findFirst({
    where: { id: roomId, studio: { ownerId: user.id, id: studioId } },
    include: {
      studio: {
        select: { latitude: true, longitude: true },
      },
    },
  });
  if (!room) return;
  const timeZone = studioTimeZone(room.studio);
  const startAt = marketplaceDateTimeLocalToUtc(
    String(form.get("startAt") ?? ""),
    timeZone,
  );
  const endAt = marketplaceDateTimeLocalToUtc(
    String(form.get("endAt") ?? ""),
    timeZone,
  );
  if (!startAt || !endAt || endAt <= startAt) return;
  const overlap = await db.booking.findFirst({
    where: {
      roomId,
      status: { in: ["PENDING_DEPOSIT", "CONFIRMED"] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { id: true },
  });
  if (overlap) {
    redirect(`/owner/availability?studioId=${studioId}&error=booking-conflict`);
  }

  await db.blockedSlot.create({
    data: { roomId, startAt, endAt, reason: text(form, "reason", 200) },
  });
  revalidatePath(`/owner/studios/${studioId}`);
  revalidatePath(`/owner/availability?studioId=${studioId}`);
}


export async function updateRoomAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const roomId = text(form, "roomId", 80);
  const room = await db.room.findFirst({ where: { id: roomId, studio: { id: studioId, ownerId: user.id } } });
  if (!room) return;
  await markListingDirty(studioId);
  await db.room.update({
    where: { id: roomId },
    data: {
      name: text(form, "name", 120) || room.name,
      description: text(form, "description", 1500),
      category: parseCategory(form.get("category")),
      hourlyRateMad: positiveInt(form.get("hourlyRateMad"), room.hourlyRateMad),
      minimumHours: positiveInt(form.get("minimumHours"), room.minimumHours),
      capacity: positiveInt(form.get("capacity"), room.capacity),
      engineerIncluded: form.get("engineerIncluded") === "on",
      active: form.get("active") === "on",
    },
  });
  revalidatePath(`/owner/studios/${studioId}`);
}

export async function removeEquipmentAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const equipmentId = text(form, "equipmentId", 80);
  const item = await db.roomEquipment.findFirst({ where: { id: equipmentId, room: { studio: { id: studioId, ownerId: user.id } } } });
  if (!item) return;
  await markListingDirty(studioId);
  await db.roomEquipment.delete({ where: { id: item.id } });
  revalidatePath(`/owner/studios/${studioId}`);
}


export async function setCoverPhotoAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const photoId = text(form, "photoId", 80);

  const photos = await db.studioPhoto.findMany({
    where: { studioId, studio: { ownerId: user.id } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  if (!photos.some((photo) => photo.id === photoId)) return;

  const ordered = [
    photoId,
    ...photos.filter((photo) => photo.id !== photoId).map((photo) => photo.id),
  ];

  await markListingDirty(studioId);
  await db.$transaction(
    ordered.map((id, index) =>
      db.studioPhoto.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );

  revalidatePath(`/owner/studios/${studioId}`);
  revalidatePath(`/owner/studios/${studioId}/preview`);
}

export async function moveStudioPhotoAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const photoId = text(form, "photoId", 80);
  const direction = text(form, "direction", 10) === "right" ? 1 : -1;

  const photos = await db.studioPhoto.findMany({
    where: { studioId, studio: { ownerId: user.id } },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });

  const index = photos.findIndex((photo) => photo.id === photoId);
  const swapIndex = index + direction;
  if (index < 0 || swapIndex < 0 || swapIndex >= photos.length) return;

  const ordered = photos.map((photo) => photo.id);
  [ordered[index], ordered[swapIndex]] = [ordered[swapIndex], ordered[index]];

  await markListingDirty(studioId);
  await db.$transaction(
    ordered.map((id, order) =>
      db.studioPhoto.update({
        where: { id },
        data: { sortOrder: order },
      }),
    ),
  );

  revalidatePath(`/owner/studios/${studioId}`);
  revalidatePath(`/owner/studios/${studioId}/preview`);
}

export async function removePhotoAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const photoId = text(form, "photoId", 80);
  const photo = await db.studioPhoto.findFirst({
    where: {
      id: photoId,
      studio: { id: studioId, ownerId: user.id },
    },
  });
  if (!photo) return;

  await markListingDirty(studioId);

  const managedBlob = isManagedMarketplaceStudioPhotoUrl(
    photo.url,
    studioId,
  );

  await db.$transaction(async (tx) => {
    await tx.studioPhoto.delete({ where: { id: photo.id } });

    if (managedBlob) {
      await tx.storedFile.deleteMany({
        where: {
          studioId,
          ownerId: user.id,
          url: photo.url,
          provider: "VERCEL_BLOB",
        },
      });
    }
  });

  if (managedBlob) {
    try {
      await deleteManagedMarketplaceStudioPhotos([photo.url], studioId);
    } catch (error) {
      console.error("marketplace-studio-photo-delete-error", {
        studioId,
        photoId,
        message:
          error instanceof Error ? error.message : "DELETE_FAILED",
      });
    }
  }

  revalidatePath(`/owner/studios/${studioId}`);
}

export async function removeAmenityAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const amenityId = text(form, "amenityId", 80);
  const item = await db.studioAmenity.findFirst({ where: { id: amenityId, studio: { id: studioId, ownerId: user.id } } });
  if (!item) return;
  await markListingDirty(studioId);
  await db.studioAmenity.delete({ where: { id: item.id } });
  revalidatePath(`/owner/studios/${studioId}`);
}

export async function removeBlockedSlotAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const slotId = text(form, "slotId", 80);
  const item = await db.blockedSlot.findFirst({ where: { id: slotId, room: { studio: { id: studioId, ownerId: user.id } } } });
  if (!item) return;
  await db.blockedSlot.delete({ where: { id: item.id } });
  revalidatePath(`/owner/studios/${studioId}`);
  revalidatePath(`/owner/availability?studioId=${studioId}`);
}

export async function submitStudioAction(form: FormData) {
  const user = await requireVerifiedRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);

  if (!/^[0-9a-f-]{36}$/i.test(studioId)) {
    redirect("/owner/studios");
  }

  const result = await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      SELECT id
      FROM "Studio"
      WHERE id = ${studioId}::uuid
      FOR UPDATE
    `;

    const studio = await tx.studio.findFirst({
      where: {
        id: studioId,
        ownerId: user.id,
        status: { in: ["DRAFT", "REJECTED"] },
      },
      include: {
        rooms: true,
        photos: true,
        openingHours: true,
      },
    });

    if (!studio) {
      return { ok: false as const, reason: "STATE" as const };
    }

    const completion = studioCompletion(studio);
    const checklist = studioOnboardingChecklist(studio);
    if (completion < 78 || !checklist.ready) {
      return { ok: false as const, reason: "INCOMPLETE" as const };
    }

    const changed = await tx.studio.updateMany({
      where: {
        id: studio.id,
        ownerId: user.id,
        status: { in: ["DRAFT", "REJECTED"] },
      },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        verifiedAt: null,
        verificationNote: "",
      },
    });

    if (!changed.count) {
      return { ok: false as const, reason: "STATE" as const };
    }

    return {
      ok: true as const,
      studio: {
        id: studio.id,
        name: studio.name,
        slug: studio.slug,
      },
    };
  });

  if (!result.ok) {
    redirect(
      "/owner/studios/" +
        studioId +
        "?submit=" +
        (result.reason === "INCOMPLETE" ? "incomplete" : "state-changed"),
    );
  }

  const admins = await db.user.findMany({
    where: {
      role: "ADMIN",
      status: "ACTIVE",
    },
    select: { id: true },
  });

  await Promise.all(
    admins.map((admin) =>
      notifyUser({
        userId: admin.id,
        type: "STUDIO_SUBMITTED",
        title: result.studio.name + " is ready for review",
        body: "A studio owner submitted a listing for verification.",
        href: "/admin/studios/" + result.studio.id,
        email: true,
      }).catch(() => undefined),
    ),
  );

  revalidatePath("/admin");
  revalidatePath("/owner");
  revalidatePath("/owner/studios");
  revalidatePath("/owner/studios/" + result.studio.id);

  redirect("/owner/studios/" + result.studio.id + "?submit=ok");
}


export async function addStudioAddonAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const studio = await ownerStudio(studioId, user.id);
  if (!studio) return;
  const name = text(form, "name", 120);
  const roomIdRaw = text(form, "roomId", 80);
  const roomId = roomIdRaw || null;
  const unitPriceMad = positiveInt(form.get("unitPriceMad"), 1);
  if (!name) return;
  if (roomId) {
    const room = await db.room.findFirst({ where: { id: roomId, studioId } });
    if (!room) return;
  }
  await db.studioAddon.create({
    data: {
      studioId,
      roomId,
      name,
      description: text(form, "description", 500),
      unitPriceMad,
      unitLabel: text(form, "unitLabel", 40) || "item",
      active: true,
    },
  });
  revalidatePath(`/owner/studios/${studioId}`);
  revalidatePath(`/studios/${studio.slug}`);
}

export async function toggleStudioAddonAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const addonId = text(form, "addonId", 80);
  const addon = await db.studioAddon.findFirst({ where: { id: addonId, studio: { id: studioId, ownerId: user.id } } });
  if (!addon) return;
  await db.studioAddon.update({ where: { id: addon.id }, data: { active: !addon.active } });
  revalidatePath(`/owner/studios/${studioId}`);
}

export async function removeStudioAddonAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const addonId = text(form, "addonId", 80);
  const addon = await db.studioAddon.findFirst({ where: { id: addonId, studio: { id: studioId, ownerId: user.id } } });
  if (!addon) return;
  await db.studioAddon.delete({ where: { id: addon.id } });
  revalidatePath(`/owner/studios/${studioId}`);
}


function validDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function nextDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

export async function blockFullDayAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const roomId = text(form, "roomId", 80);
  const date = text(form, "date", 10);
  if (!validDateKey(date)) return;

  const studio = await db.studio.findFirst({
    where: { id: studioId, ownerId: user.id },
    include: { rooms: { where: { active: true } } },
  });
  if (!studio) return;

  const targetRooms =
    roomId === "ALL"
      ? studio.rooms
      : studio.rooms.filter((room) => room.id === roomId);
  if (!targetRooms.length) return;

  const timeZone = studioTimeZone(studio);
  const startAt = marketplaceDateTimeLocalToUtc(
    date + "T00:00",
    timeZone,
  );
  const endAt = marketplaceDateTimeLocalToUtc(
    nextDateKey(date) + "T00:00",
    timeZone,
  );
  if (!startAt || !endAt) return;

  const conflict = await db.booking.findFirst({
    where: {
      roomId: { in: targetRooms.map((room) => room.id) },
      status: { in: ["PENDING_DEPOSIT", "CONFIRMED"] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { id: true },
  });

  if (conflict) {
    redirect("/owner/availability?studioId=" + studioId + "&error=booking-conflict");
  }

  await db.blockedSlot.createMany({
    data: targetRooms.map((room) => ({
      roomId: room.id,
      startAt,
      endAt,
      reason: "Full-day block",
    })),
  });

  revalidatePath("/owner/availability");
  revalidatePath("/owner/availability?studioId=" + studioId);
}

export async function blockVacationRangeAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const startDate = text(form, "startDate", 10);
  const endDate = text(form, "endDate", 10);
  const reason = text(form, "reason", 200) || "Vacation / unavailable";

  if (!validDateKey(startDate) || !validDateKey(endDate) || endDate < startDate) {
    return;
  }

  const studio = await db.studio.findFirst({
    where: { id: studioId, ownerId: user.id },
    include: { rooms: { where: { active: true } } },
  });
  if (!studio || !studio.rooms.length) return;

  const timeZone = studioTimeZone(studio);
  const startAt = marketplaceDateTimeLocalToUtc(
    startDate + "T00:00",
    timeZone,
  );
  const endAt = marketplaceDateTimeLocalToUtc(
    nextDateKey(endDate) + "T00:00",
    timeZone,
  );
  if (!startAt || !endAt) return;

  const conflict = await db.booking.findFirst({
    where: {
      roomId: { in: studio.rooms.map((room) => room.id) },
      status: { in: ["PENDING_DEPOSIT", "CONFIRMED"] },
      startAt: { lt: endAt },
      endAt: { gt: startAt },
    },
    select: { id: true },
  });

  if (conflict) {
    redirect("/owner/availability?studioId=" + studioId + "&error=booking-conflict");
  }

  await db.blockedSlot.createMany({
    data: studio.rooms.map((room) => ({
      roomId: room.id,
      startAt,
      endAt,
      reason,
    })),
  });

  revalidatePath("/owner/availability");
  revalidatePath("/owner/availability?studioId=" + studioId);
}
