import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { SeoStudioLanding } from "@/components/SeoStudioLanding";
import { getCurrentUser } from "@/lib/auth";
import {
  getSeoStudios,
  resolveVerifiedCity,
} from "@/lib/seo-studios";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ city: string }>;
}): Promise<Metadata> {
  const { city: citySlug } = await params;
  const city = await resolveVerifiedCity(citySlug);

  if (!city) {
    return {
      title: "Studios not found",
      robots: { index: false, follow: false },
    };
  }

  return {
    title: "Studios in " + city,
    description:
      "Compare verified recording, podcast, photo, video and creative studios in " +
      city +
      ". See live room prices and book directly on 36.",
    alternates: {
      canonical: "/studios/in/" + citySlug,
    },
  };
}

export default async function CityStudiosPage({
  params,
}: {
  params: Promise<{ city: string }>;
}) {
  const user = await getCurrentUser();
  const { city: citySlug } = await params;
  const city = await resolveVerifiedCity(citySlug);
  if (!city) notFound();

  const studios = await getSeoStudios(city);
  if (!studios.length) notFound();

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <SeoStudioLanding city={city} studios={studios} />
    </main>
  );
}
