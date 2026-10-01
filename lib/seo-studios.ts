import type { StudioCategory } from "@prisma/client";

import { db } from "@/lib/db";
import {
  STUDIO_CATEGORIES,
  categoryLabel,
  slugify,
} from "@/lib/studio";

export function categoryFromSeoSlug(
  value: string | undefined,
): StudioCategory | null {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  const match = STUDIO_CATEGORIES.find(
    (item) =>
      slugify(item.label) === normalized ||
      item.value.toLowerCase() === normalized,
  );

  return match?.value || null;
}

export function categorySeoSlug(category: StudioCategory) {
  return slugify(categoryLabel(category));
}

export async function resolveVerifiedCity(citySlug: string) {
  const rows = await db.studio.findMany({
    where: {
      status: "VERIFIED",
      city: { not: "" },
    },
    distinct: ["city"],
    select: { city: true },
    orderBy: { city: "asc" },
  });

  return (
    rows.find((row) => slugify(row.city) === citySlug)?.city || null
  );
}

export async function getSeoStudios(
  city: string,
  category?: StudioCategory | null,
) {
  return db.studio.findMany({
    where: {
      status: "VERIFIED",
      city: { equals: city, mode: "insensitive" },
      rooms: {
        some: {
          active: true,
          ...(category ? { category } : {}),
        },
      },
    },
    include: {
      photos: {
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
      rooms: {
        where: {
          active: true,
          ...(category ? { category } : {}),
        },
        orderBy: { hourlyRateMad: "asc" },
      },
      reviews: {
        select: { rating: true },
      },
    },
    orderBy: [
      { verifiedAt: "desc" },
      { name: "asc" },
    ],
    take: 60,
  });
}
