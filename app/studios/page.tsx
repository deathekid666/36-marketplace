import Link from "next/link";
import type { StudioCategory } from "@prisma/client";

import { AppHeader } from "@/components/AppHeader";
import { MarketplaceSearchBar } from "@/components/MarketplaceSearchBar";
import { StudioMap } from "@/components/StudioMap";
import { toggleFavoriteAction } from "@/app/favorites/actions";
import { getCurrentUser } from "@/lib/auth";
import { getRoomAvailability } from "@/lib/booking";
import { db } from "@/lib/db";
import { trackMarketplaceEvent } from "@/lib/analytics";
import { categoryLabel, STUDIO_CATEGORIES } from "@/lib/studio";

function parseCategory(value?: string): StudioCategory | undefined {
  return STUDIO_CATEGORIES.some((item) => item.value === value)
    ? (value as StudioCategory)
    : undefined;
}

function parseDuration(value?: string) {
  const number = Math.round(Number(value || "1"));
  return Number.isFinite(number) ? Math.max(1, Math.min(12, number)) : 1;
}

export default async function StudiosPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    city?: string;
    date?: string;
    duration?: string;
    maxPrice?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const query = await searchParams;
  const category = parseCategory(query.category);
  const city = String(query.city || "Casablanca").trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(query.date || ""))
    ? String(query.date)
    : "";
  const durationHours = parseDuration(query.duration);
  const parsedMax = Math.round(Number(query.maxPrice || "0"));
  const maxPrice = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : undefined;

  await trackMarketplaceEvent({
    eventType: "SEARCH",
    userId: user?.id,
    metadata: {
      city,
      category: category || "ANY",
      date: date || null,
      durationHours,
      maxPrice: maxPrice || null,
    },
  });

  const [studios, locationRows] = await Promise.all([
    db.studio.findMany({
      where: {
        status: "VERIFIED",
        ...(city
          ? {
              OR: [
                { city: { contains: city, mode: "insensitive" as const } },
                { neighborhood: { contains: city, mode: "insensitive" as const } },
                { address: { contains: city, mode: "insensitive" as const } },
              ],
            }
          : {}),
        rooms: {
          some: {
            active: true,
            ...(category ? { category } : {}),
            ...(maxPrice ? { hourlyRateMad: { lte: maxPrice } } : {}),
          },
        },
      },
      include: {
        photos: { orderBy: { sortOrder: "asc" }, take: 1 },
        rooms: {
          where: {
            active: true,
            ...(category ? { category } : {}),
            ...(maxPrice ? { hourlyRateMad: { lte: maxPrice } } : {}),
          },
          orderBy: { hourlyRateMad: "asc" },
        },
        reviews: { select: { rating: true } },
      },
      orderBy: [{ verifiedAt: "desc" }, { name: "asc" }],
      take: 60,
    }),
    db.studio.findMany({
      where: { status: "VERIFIED" },
      select: { city: true, neighborhood: true },
      orderBy: [{ city: "asc" }, { neighborhood: "asc" }],
      take: 200,
    }),
  ]);

  const availability = date
    ? await Promise.all(
        studios.map(async (studio) => {
          const checks = await Promise.all(
            studio.rooms.map((room) =>
              getRoomAvailability(room.id, date, durationHours * 60),
            ),
          );
          return checks.some((slots) => slots.length > 0);
        }),
      )
    : studios.map(() => true);

  const results = studios.filter((_, index) => availability[index]);

  const favoriteIds =
    user?.role === "CREATOR"
      ? new Set(
          (
            await db.favorite.findMany({
              where: {
                userId: user.id,
                studioId: { in: results.map((studio) => studio.id) },
              },
              select: { studioId: true },
            })
          ).map((favorite) => favorite.studioId),
        )
      : new Set<string>();

  const mapPoints = results
    .filter((studio) => studio.latitude != null && studio.longitude != null)
    .map((studio) => ({
      id: studio.id,
      name: studio.name,
      lat: Number(studio.latitude),
      lng: Number(studio.longitude),
      href: "/studios/" + studio.slug,
      price: studio.rooms[0]?.hourlyRateMad || null,
    }));

  const locationSuggestions = Array.from(
    new Set(
      locationRows.flatMap((row) => [
        row.city,
        row.neighborhood ? `${row.neighborhood}, ${row.city}` : "",
      ]),
    ),
  ).filter(Boolean);

  const detailParams = new URLSearchParams();
  if (date) detailParams.set("date", date);
  detailParams.set("duration", String(durationHours));
  const detailSuffix = "?" + detailParams.toString();

  const returnParams = new URLSearchParams();
  if (category) returnParams.set("category", category);
  if (city) returnParams.set("city", city);
  if (date) returnParams.set("date", date);
  returnParams.set("duration", String(durationHours));
  if (maxPrice) returnParams.set("maxPrice", String(maxPrice));
  const returnTo = "/studios?" + returnParams.toString();

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />

      <section className="mx-auto max-w-[1500px] px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-acid">
              Marketplace
            </span>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              Find your next creative space
            </h1>
            <p className="mt-3 text-sm text-zinc-500">
              Search by location, date and studio type. See live availability before you open a listing.
            </p>
          </div>
          <Link
            href="/now"
            className="rounded-full border border-acid/30 px-5 py-3 text-xs font-black text-acid"
          >
            ⚡ 36 NOW
          </Link>
        </div>

        <MarketplaceSearchBar
          category={category}
          city={city}
          date={date}
          durationHours={durationHours}
          maxPrice={maxPrice}
          categories={STUDIO_CATEGORIES}
          locationSuggestions={locationSuggestions}
        />

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-500">
            <b className="text-zinc-200">{results.length}</b> verified studio
            {results.length === 1 ? "" : "s"}
            {date ? ` available for ${durationHours}h` : ""}
            {city ? ` in ${city}` : ""}
          </p>
          {user?.role === "CREATOR" && (
            <Link href="/creator/requests" className="text-xs font-black text-acid">
              Can&apos;t find it? Post a 36 Request →
            </Link>
          )}
        </div>

        {results.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-zinc-800 p-14 text-center">
            <h2 className="text-xl font-black">No matching studios</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-600">
              Try another location, date, category or price ceiling.
            </p>
          </div>
        ) : (
          <div
            className={
              mapPoints.length > 0
                ? "mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.05fr)_minmax(460px,.95fr)]"
                : "mt-7"
            }
          >
            <div className={mapPoints.length > 0 ? "grid gap-5 md:grid-cols-2" : "grid gap-5 md:grid-cols-2 xl:grid-cols-3"}>
              {results.map((studio) => {
                const photo = studio.photos[0]?.url;
                const minRate = studio.rooms[0]?.hourlyRateMad;
                const average = studio.reviews.length
                  ? studio.reviews.reduce((sum, review) => sum + review.rating, 0) /
                    studio.reviews.length
                  : null;
                const saved = favoriteIds.has(studio.id);

                return (
                  <article key={studio.id} className="group">
                    <div className="relative">
                      <Link href={"/studios/" + studio.slug + detailSuffix}>
                        <div className="aspect-[4/3] overflow-hidden rounded-3xl bg-zinc-900">
                          {photo ? (
                            <img
                              src={photo}
                              alt={studio.name}
                              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                            />
                          ) : (
                            <div className="grid h-full place-items-center text-4xl font-black text-acid">
                              36
                            </div>
                          )}
                        </div>
                      </Link>

                      {user?.role === "CREATOR" && (
                        <form action={toggleFavoriteAction} className="absolute right-3 top-3">
                          <input type="hidden" name="studioId" value={studio.id} />
                          <input type="hidden" name="returnTo" value={returnTo} />
                          <button
                            aria-label={saved ? "Remove from favorites" : "Save studio"}
                            className="grid h-10 w-10 place-items-center rounded-full bg-black/55 text-xl text-white backdrop-blur transition hover:bg-black/75"
                          >
                            {saved ? "♥" : "♡"}
                          </button>
                        </form>
                      )}
                    </div>

                    <Link href={"/studios/" + studio.slug + detailSuffix} className="block pt-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-black">{studio.name}</h2>
                          <p className="mt-1 text-sm text-zinc-500">
                            {studio.neighborhood || studio.city}, {studio.city}
                          </p>
                          <p className="mt-1 text-xs text-zinc-600">
                            {categoryLabel(studio.primaryCategory)}
                            {date ? " · Available" : ""}
                          </p>
                        </div>
                        <span className="whitespace-nowrap text-sm font-bold">
                          {average ? `★ ${average.toFixed(1)}` : "New"}
                        </span>
                      </div>

                      <p className="mt-2 text-sm">
                        <b>{minRate ? `${minRate} MAD` : "—"}</b>
                        <span className="text-zinc-500"> / hour</span>
                      </p>
                    </Link>
                  </article>
                );
              })}
            </div>

            {mapPoints.length > 0 && (
              <aside className="hidden xl:block">
                <div className="sticky top-5">
                  <div className="mb-3 flex items-center justify-between">
                    <b className="text-sm">Map</b>
                    <span className="text-xs text-zinc-600">
                      {mapPoints.length} mapped studio{mapPoints.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <StudioMap points={mapPoints} />
                </div>
              </aside>
            )}

            {mapPoints.length > 0 && (
              <div className="xl:hidden">
                <StudioMap points={mapPoints} />
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
