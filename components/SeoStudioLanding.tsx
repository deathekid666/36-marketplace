import Link from "next/link";

import { formatMoney } from "@/lib/commerce";
import type { StudioCategory } from "@prisma/client";

import {
  STUDIO_CATEGORIES,
  categoryLabel,
  slugify,
} from "@/lib/studio";

type StudioLandingItem = {
  id: string;
  name: string;
  slug: string;
  city: string;
  neighborhood: string;
  currency: string;
  primaryCategory: StudioCategory;
  photos: Array<{ url: string; alt: string }>;
  rooms: Array<{
    id: string;
    hourlyRateMad: number;
    category: StudioCategory;
  }>;
  reviews: Array<{ rating: number }>;
};

export function SeoStudioLanding({
  city,
  category,
  studios,
}: {
  city: string;
  category?: StudioCategory | null;
  studios: StudioLandingItem[];
}) {
  const title = category
    ? categoryLabel(category) + " studios in " + city
    : "Studios in " + city;

  const base = process.env.NEXT_PUBLIC_APP_URL || "https://36.ma";
  const pageUrl = category
    ? base +
      "/studios/in/" +
      slugify(city) +
      "/" +
      slugify(categoryLabel(category))
    : base + "/studios/in/" + slugify(city);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: title,
    url: pageUrl,
    numberOfItems: studios.length,
    itemListElement: studios.map((studio, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: {
        "@type": "LocalBusiness",
        name: studio.name,
        url: base + "/studios/" + studio.slug,
        address: {
          "@type": "PostalAddress",
          addressLocality: studio.city,
          streetAddress: studio.neighborhood || undefined,
        },
        ...(studio.reviews.length
          ? {
              aggregateRating: {
                "@type": "AggregateRating",
                ratingValue:
                  Math.round(
                    (studio.reviews.reduce(
                      (sum, review) => sum + review.rating,
                      0,
                    ) /
                      studio.reviews.length) *
                      10,
                  ) / 10,
                reviewCount: studio.reviews.length,
              },
            }
          : {}),
      },
    })),
  };

  return (
    <section className="mx-auto max-w-7xl px-5 py-10 sm:py-12">
      <Link
        href="/studios"
        className="text-xs font-bold text-zinc-500 hover:text-white"
      >
        ← All studios
      </Link>

      <div className="mt-7 max-w-3xl">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-acid">
          Verified marketplace
        </span>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
          {title}
        </h1>
        <p className="mt-4 text-sm leading-7 text-zinc-500">
          Compare verified, bookable creative studios in {city}. Prices shown
          are live room rates from studio owners on 36.
        </p>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          href={"/studios/in/" + slugify(city)}
          className={
            "rounded-full border px-4 py-2 text-xs font-black " +
            (!category
              ? "border-acid/40 bg-acid/[0.05] text-acid"
              : "border-zinc-800 text-zinc-500")
          }
        >
          All studios
        </Link>
        {STUDIO_CATEGORIES.map((item) => (
          <Link
            key={item.value}
            href={
              "/studios/in/" +
              slugify(city) +
              "/" +
              slugify(item.label)
            }
            className={
              "rounded-full border px-4 py-2 text-xs font-black " +
              (category === item.value
                ? "border-acid/40 bg-acid/[0.05] text-acid"
                : "border-zinc-800 text-zinc-500")
            }
          >
            {item.label}
          </Link>
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between gap-4">
        <p className="text-sm text-zinc-500">
          <b className="text-zinc-200">{studios.length}</b> verified studio
          {studios.length === 1 ? "" : "s"}
        </p>
        <Link
          href={
            "/studios?city=" +
            encodeURIComponent(city) +
            (category ? "&category=" + category : "")
          }
          className="text-xs font-black text-acid"
        >
          Open live search →
        </Link>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {studios.map((studio) => {
          const photo = studio.photos[0]?.url;
          const minRate = studio.rooms[0]?.hourlyRateMad;
          const average = studio.reviews.length
            ? studio.reviews.reduce(
                (sum, review) => sum + review.rating,
                0,
              ) / studio.reviews.length
            : null;

          return (
            <Link
              key={studio.id}
              href={"/studios/" + studio.slug}
              className="group overflow-hidden rounded-3xl border border-zinc-900 bg-zinc-950/70 transition hover:border-zinc-700"
            >
              <div className="aspect-[4/3] overflow-hidden bg-zinc-900">
                {photo ? (
                  <img
                    src={photo}
                    alt={studio.photos[0]?.alt || studio.name}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="grid h-full place-items-center text-4xl font-black text-acid">
                    36
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-black">
                      {studio.name}
                    </h2>
                    <p className="mt-1 text-xs text-zinc-600">
                      {studio.neighborhood || studio.city}, {studio.city}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-black">
                    {average ? "★ " + average.toFixed(1) : "New"}
                  </span>
                </div>
                <p className="mt-4 text-sm">
                  <b>{minRate ? formatMoney(minRate, studio.currency) : "—"}</b>
                  <span className="text-zinc-600"> / hour</span>
                </p>
              </div>
            </Link>
          );
        })}
      </div>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
        }}
      />
    </section>
  );
}
