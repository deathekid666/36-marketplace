import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { SeoStudioLanding } from "@/components/SeoStudioLanding";
import { getCurrentUser } from "@/lib/auth";
import {
  categoryFromSeoSlug,
  getSeoStudios,
  resolveVerifiedCity,
} from "@/lib/seo-studios";
import { categoryLabel } from "@/lib/studio";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string; category: string }>;
}): Promise<Metadata> {
  const { city: citySlug, category: categorySlug } = await params;
  const [city, category] = await Promise.all([
    resolveVerifiedCity(citySlug),
    Promise.resolve(categoryFromSeoSlug(categorySlug)),
  ]);

  if (!city || !category) {
    return {
      title: "Studios not found",
      robots: { index: false, follow: false },
    };
  }

  const label = categoryLabel(category);

  return {
    title: label + " studios in " + city,
    description:
      "Compare verified " +
      label.toLowerCase() +
      " studios in " +
      city +
      ". See live room rates, availability and book directly on 36.",
    alternates: {
      canonical:
        "/studios/in/" + citySlug + "/" + categorySlug,
    },
  };
}

export default async function CategoryCityStudiosPage({
  params,
}: {
  params: Promise<{ city: string; category: string }>;
}) {
  const user = await getCurrentUser();
  const { city: citySlug, category: categorySlug } = await params;

  const [city, category] = await Promise.all([
    resolveVerifiedCity(citySlug),
    Promise.resolve(categoryFromSeoSlug(categorySlug)),
  ]);

  if (!city || !category) notFound();

  const studios = await getSeoStudios(city, category);
  if (!studios.length) notFound();

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <SeoStudioLanding
        city={city}
        category={category}
        studios={studios}
      />
    </main>
  );
}
