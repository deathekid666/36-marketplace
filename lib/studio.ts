import type { Studio, StudioCategory, StudioStatus } from "@prisma/client";

export const STUDIO_CATEGORIES: { value: StudioCategory; label: string }[] = [
  { value: "RECORDING", label: "Recording" },
  { value: "PODCAST", label: "Podcast" },
  { value: "PHOTO", label: "Photo" },
  { value: "VIDEO", label: "Video" },
  { value: "REHEARSAL", label: "Rehearsal" },
  { value: "DJ", label: "DJ" },
  { value: "PRODUCTION", label: "Production" },
];

export const DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export function categoryLabel(value: StudioCategory) {
  return STUDIO_CATEGORIES.find((x) => x.value === value)?.label ?? value;
}

export function studioStatusLabel(status: StudioStatus) {
  return {
    DRAFT: "Draft",
    SUBMITTED: "Under review",
    VERIFIED: "Verified",
    REJECTED: "Changes required",
    SUSPENDED: "Suspended",
  }[status];
}

export function slugify(input: string) {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "studio";
}

export function studioCompletion(studio: Pick<Studio, "name" | "description" | "city" | "neighborhood" | "address" | "phone" | "latitude" | "longitude"> & {
  rooms?: unknown[];
  photos?: unknown[];
  openingHours?: unknown[];
}) {
  const checks = [
    studio.name.length > 2,
    studio.description.length >= 40,
    !!studio.city,
    !!studio.neighborhood,
    !!studio.address,
    !!studio.phone,
    studio.latitude != null && studio.longitude != null,
    (studio.rooms?.length ?? 0) > 0,
    (studio.photos?.length ?? 0) > 0,
    (studio.openingHours?.length ?? 0) >= 5,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}
