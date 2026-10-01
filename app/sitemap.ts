import type { MetadataRoute } from "next";

import { db } from "@/lib/db";
import {
  categoryLabel,
  slugify,
} from "@/lib/studio";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://36-marketplace.vercel.app";

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: base + "/studios",
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.9,
    },
    {
      url: base + "/now",
      lastModified: new Date(),
      changeFrequency: "hourly",
      priority: 0.8,
    },
  ];

  try {
    const studios = await db.studio.findMany({
      where: { status: "VERIFIED" },
      select: {
        slug: true,
        city: true,
        updatedAt: true,
        rooms: {
          where: { active: true },
          select: { category: true },
        },
      },
    });

    const cityMap = new Map<
      string,
      { city: string; updatedAt: Date }
    >();
    const categoryMap = new Map<
      string,
      {
        city: string;
        category: (typeof studios)[number]["rooms"][number]["category"];
        updatedAt: Date;
      }
    >();

    for (const studio of studios) {
      const cityKey = slugify(studio.city);
      const currentCity = cityMap.get(cityKey);
      if (
        !currentCity ||
        studio.updatedAt > currentCity.updatedAt
      ) {
        cityMap.set(cityKey, {
          city: studio.city,
          updatedAt: studio.updatedAt,
        });
      }

      for (const room of studio.rooms) {
        const key =
          cityKey +
          "/" +
          slugify(categoryLabel(room.category));
        const current = categoryMap.get(key);
        if (!current || studio.updatedAt > current.updatedAt) {
          categoryMap.set(key, {
            city: studio.city,
            category: room.category,
            updatedAt: studio.updatedAt,
          });
        }
      }
    }

    return [
      ...staticEntries,
      ...studios.map((studio) => ({
        url: base + "/studios/" + studio.slug,
        lastModified: studio.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
      ...Array.from(cityMap.values()).map((entry) => ({
        url:
          base +
          "/studios/in/" +
          slugify(entry.city),
        lastModified: entry.updatedAt,
        changeFrequency: "daily" as const,
        priority: 0.75,
      })),
      ...Array.from(categoryMap.values()).map((entry) => ({
        url:
          base +
          "/studios/in/" +
          slugify(entry.city) +
          "/" +
          slugify(categoryLabel(entry.category)),
        lastModified: entry.updatedAt,
        changeFrequency: "daily" as const,
        priority: 0.7,
      })),
    ];
  } catch {
    return staticEntries;
  }
}
