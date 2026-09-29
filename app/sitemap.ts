import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = process.env.NEXT_PUBLIC_APP_URL || "https://36.ma";
  const staticEntries: MetadataRoute.Sitemap = [
    { url: base, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    { url: `${base}/studios`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/now`, lastModified: new Date(), changeFrequency: "hourly", priority: 0.8 },
  ];

  try {
    const studios = await db.studio.findMany({
      where: { status: "VERIFIED" },
      select: { slug: true, updatedAt: true },
    });

    return [
      ...staticEntries,
      ...studios.map((studio) => ({
        url: `${base}/studios/${studio.slug}`,
        lastModified: studio.updatedAt,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      })),
    ];
  } catch {
    return staticEntries;
  }
}
