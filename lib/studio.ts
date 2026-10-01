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


export function studioOnboardingChecklist(studio: {
  name: string;
  description: string;
  city: string;
  address: string;
  phone: string;
  latitude: unknown | null;
  longitude: unknown | null;
  rooms: Array<{
    active: boolean;
    hourlyRateMad: number;
    minimumHours: number;
    capacity: number;
  }>;
  photos: unknown[];
  openingHours: Array<{ closed: boolean }>;
}) {
  const activeRooms = studio.rooms.filter((room) => room.active);
  const items = [
    {
      key: "profile",
      label: "Studio profile",
      detail: "Name, description and public phone",
      complete:
        studio.name.trim().length >= 3 &&
        studio.description.trim().length >= 40 &&
        studio.phone.trim().length >= 5,
    },
    {
      key: "location",
      label: "Exact location",
      detail: "City, address and map coordinates",
      complete:
        Boolean(studio.city.trim()) &&
        Boolean(studio.address.trim()) &&
        studio.latitude != null &&
        studio.longitude != null,
    },
    {
      key: "rooms",
      label: "Bookable room",
      detail: "At least one active room with valid hourly pricing",
      complete:
        activeRooms.length > 0 &&
        activeRooms.every(
          (room) =>
            room.hourlyRateMad > 0 &&
            room.minimumHours > 0 &&
            room.capacity > 0,
        ),
    },
    {
      key: "photos",
      label: "Studio photos",
      detail: "At least one real photo",
      complete: studio.photos.length > 0,
    },
    {
      key: "hours",
      label: "Availability",
      detail: "At least five configured days and one open day",
      complete:
        studio.openingHours.length >= 5 &&
        studio.openingHours.some((hour) => !hour.closed),
    },
  ];

  return {
    items,
    completeCount: items.filter((item) => item.complete).length,
    totalCount: items.length,
    ready: items.every((item) => item.complete),
  };
}
