"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { StudioCategory } from "@prisma/client";

import { requireRole, requireVerifiedRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  DAYS,
  STUDIO_CATEGORIES,
  slugify,
  studioCompletion,
  studioOnboardingChecklist,
} from "@/lib/studio";
import { casablancaDateTimeLocalToUtc } from "@/lib/time";
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

export async function updateStudioAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const studio = await ownerStudio(studioId, user.id);
  if (!studio) return;

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
      latitude: optionalNumber(form.get("latitude"), -90, 90),
      longitude: optionalNumber(form.get("longitude"), -180, 180),
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
  });
  if (!room) return;
  const startAt = casablancaDateTimeLocalToUtc(String(form.get("startAt") ?? ""));
  const endAt = casablancaDateTimeLocalToUtc(String(form.get("endAt") ?? ""));
  if (!startAt || !endAt || endAt <= startAt) return;
  await markListingDirty(studioId);
  await db.blockedSlot.create({
    data: { roomId, startAt, endAt, reason: text(form, "reason", 200) },
  });
  revalidatePath(`/owner/studios/${studioId}`);
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
  await markListingDirty(studioId);
  await db.blockedSlot.delete({ where: { id: item.id } });
  revalidatePath(`/owner/studios/${studioId}`);
}

export async function submitStudioAction(form: FormData) {
  const user = await requireVerifiedRole("STUDIO_OWNER");
  const studioId = text(form, "studioId", 80);
  const studio = await db.studio.findFirst({
    where: { id: studioId, ownerId: user.id },
    include: { rooms: true, photos: true, openingHours: true },
  });
  if (!studio || studio.status === "SUSPENDED") return;
  const completion = studioCompletion(studio);
  const checklist = studioOnboardingChecklist(studio);
  if (completion < 78 || !checklist.ready) {
    redirect(`/owner/studios/${studioId}?submit=incomplete`);
  }
  await db.studio.update({
    where: { id: studioId },
    data: { status: "SUBMITTED", submittedAt: new Date(), verificationNote: "" },
  });
  redirect(`/owner/studios/${studioId}?submit=ok`);
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
