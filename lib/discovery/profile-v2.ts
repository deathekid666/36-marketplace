import type { Prisma } from "@prisma/client";

import { isUnsafeDiscoveryProofUrl } from "@/lib/discovery/security";

export type DirectoryProfileV2 = {
  description: string;
  whatsapp: string;
  services: string[];
  equipment: string[];
  languages: string[];
  openingHours: string;
  photoUrls: string[];
};

export const EMPTY_DIRECTORY_PROFILE_V2: DirectoryProfileV2 = {
  description: "",
  whatsapp: "",
  services: [],
  equipment: [],
  languages: [],
  openingHours: "",
  photoUrls: [],
};

function cleanText(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

function cleanList(value: unknown, maxItems = 20, maxLength = 90) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[\n,]/)
        .map((item) => item.trim());

  return [...new Set(
    source
      .map((item) => cleanText(item, maxLength))
      .filter(Boolean),
  )].slice(0, maxItems);
}

function safePhotoUrl(value: unknown) {
  const raw = cleanText(value, 700);
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (isUnsafeDiscoveryProofUrl(url.toString())) return null;
  return url.toString();
}

function cleanPhotos(value: unknown) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[\n,]/)
        .map((item) => item.trim());

  return [...new Set(
    source.map(safePhotoUrl).filter((value): value is string => Boolean(value)),
  )].slice(0, 6);
}

export function parseDirectoryProfileV2(metadata: Prisma.JsonValue | null | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return EMPTY_DIRECTORY_PROFILE_V2;
  }

  const profile = (metadata as Prisma.JsonObject).profileV2;
  if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
    return EMPTY_DIRECTORY_PROFILE_V2;
  }

  const raw = profile as Prisma.JsonObject;
  return {
    description: cleanText(raw.description, 2400),
    whatsapp: cleanText(raw.whatsapp, 80),
    services: cleanList(raw.services, 20, 90),
    equipment: cleanList(raw.equipment, 30, 110),
    languages: cleanList(raw.languages, 12, 60),
    openingHours: cleanText(raw.openingHours, 1000),
    photoUrls: cleanPhotos(raw.photoUrls),
  } satisfies DirectoryProfileV2;
}

export function buildDirectoryProfileV2(input: {
  description?: string;
  whatsapp?: string;
  services?: string | string[];
  equipment?: string | string[];
  languages?: string | string[];
  openingHours?: string;
  photoUrls?: string | string[];
}) {
  const rawPhotos = Array.isArray(input.photoUrls)
    ? input.photoUrls
    : String(input.photoUrls || "")
        .split(/[\n,]/)
        .map((item) => item.trim());

  const invalidPhoto = rawPhotos
    .filter(Boolean)
    .find((value) => !safePhotoUrl(value));

  if (invalidPhoto) throw new Error("OWNER_PROFILE_PHOTO_URL_INVALID");

  const whatsapp = cleanText(input.whatsapp, 80);
  if (whatsapp && whatsapp.replace(/\D/g, "").length < 8) {
    throw new Error("OWNER_PROFILE_WHATSAPP_INVALID");
  }

  return {
    description: cleanText(input.description, 2400),
    whatsapp,
    services: cleanList(input.services, 20, 90),
    equipment: cleanList(input.equipment, 30, 110),
    languages: cleanList(input.languages, 12, 60),
    openingHours: cleanText(input.openingHours, 1000),
    photoUrls: cleanPhotos(rawPhotos),
  } satisfies DirectoryProfileV2;
}

export function profileV2Completeness(profile: DirectoryProfileV2) {
  return [
    Boolean(profile.description),
    Boolean(profile.whatsapp),
    profile.services.length > 0,
    profile.equipment.length > 0,
    profile.languages.length > 0,
    Boolean(profile.openingHours),
    profile.photoUrls.length > 0,
  ].filter(Boolean).length;
}

export function whatsappUrl(value: string | null | undefined) {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length >= 8 ? "https://wa.me/" + digits : null;
}
