import Link from "next/link";
import type { Prisma, StudioCategory } from "@prisma/client";

import { AppHeader } from "@/components/AppHeader";
import { CreativeExplorerMap } from "@/components/CreativeExplorerMap";
import { MarketplaceSearchBar } from "@/components/MarketplaceSearchBar";
import { CompareStudioButton } from "@/components/CompareStudioButton";
import { CompareTray } from "@/components/CompareTray";
import { toggleFavoriteAction } from "@/app/favorites/actions";
import { getCurrentUser } from "@/lib/auth";
import { getRoomAvailability } from "@/lib/booking";
import { db } from "@/lib/db";
import { trackMarketplaceEvent } from "@/lib/analytics";
import {
  discoveryCategoriesForStudioCategory,
  discoveryCategoryLabel,
} from "@/lib/discovery/search";
import { discoveryStaleCutoff } from "@/lib/discovery/freshness";
import { discoveryRolloutWhere } from "@/lib/discovery/rollout";
import { normalizeSearchText } from "@/lib/discovery/normalization";
import { categoryLabel, slugify, STUDIO_CATEGORIES } from "@/lib/studio";

function parseCategory(value?: string): StudioCategory | undefined {
  return STUDIO_CATEGORIES.some((item) => item.value === value)
    ? (value as StudioCategory)
    : undefined;
}

function parseDuration(value?: string) {
  const number = Math.round(Number(value || "1"));
  return Number.isFinite(number) ? Math.max(1, Math.min(12, number)) : 1;
}

function parsePositiveInt(value?: string, max = 100000) {
  const parsed = Math.round(Number(value || "0"));
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(max, parsed)
    : undefined;
}

function parseRating(value?: string) {
  const parsed = Number(value || "0");
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 5
    ? parsed
    : undefined;
}

function parseSort(value?: string) {
  const allowed = new Set([
    "recommended",
    "price_asc",
    "price_desc",
    "rating_desc",
    "popular",
    "capacity_desc",
  ]);
  return allowed.has(String(value || ""))
    ? String(value)
    : "recommended";
}

export default async function StudiosPage({
  searchParams,
}: {
  searchParams: Promise<{
    category?: string;
    city?: string;
    date?: string;
    duration?: string;
    minPrice?: string;
    maxPrice?: string;
    capacity?: string;
    engineer?: string;
    equipment?: string;
    amenity?: string;
    minRating?: string;
    sort?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const query = await searchParams;
  const category = parseCategory(query.category);
  const city = String(query.city || "").trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(query.date || ""))
    ? String(query.date)
    : "";
  const durationHours = parseDuration(query.duration);
  const minPrice = parsePositiveInt(query.minPrice);
  const maxPrice = parsePositiveInt(query.maxPrice);
  const capacity = parsePositiveInt(query.capacity, 500);
  const engineerIncluded = query.engineer === "1";
  const equipment = String(query.equipment || "").trim().slice(0, 100);
  const amenity = String(query.amenity || "").trim().slice(0, 100);
  const minRating = parseRating(query.minRating);
  const sort = parseSort(query.sort);

  const roomWhere: Prisma.RoomWhereInput = {
    active: true,
    ...(category ? { category } : {}),
    ...(minPrice || maxPrice
      ? {
          hourlyRateMad: {
            ...(minPrice ? { gte: minPrice } : {}),
            ...(maxPrice ? { lte: maxPrice } : {}),
          },
        }
      : {}),
    ...(capacity ? { capacity: { gte: capacity } } : {}),
    ...(engineerIncluded ? { engineerIncluded: true } : {}),
    ...(equipment
      ? {
          equipment: {
            some: {
              name: {
                contains: equipment,
                mode: "insensitive",
              },
            },
          },
        }
      : {}),
  };

  const advancedInventoryFilters = Boolean(
    minPrice ||
      maxPrice ||
      capacity ||
      engineerIncluded ||
      equipment ||
      amenity ||
      minRating ||
      sort !== "recommended",
  );

  await trackMarketplaceEvent({
    eventType: "SEARCH",
    userId: user?.id,
    metadata: {
      city,
      category: category || "ANY",
      date: date || null,
      durationHours,
      minPrice: minPrice || null,
      maxPrice: maxPrice || null,
      capacity: capacity || null,
      engineerIncluded,
      equipment: equipment || null,
      amenity: amenity || null,
      minRating: minRating || null,
      sort,
    },
  });

  const discoveryCategories = discoveryCategoriesForStudioCategory(category);
  const staleCutoff = discoveryStaleCutoff();

  const [studios, locationRows, candidateRows, candidateLocationRows] = await Promise.all([
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
        rooms: { some: roomWhere },
        ...(amenity
          ? {
              amenities: {
                some: {
                  name: {
                    contains: amenity,
                    mode: "insensitive" as const,
                  },
                },
              },
            }
          : {}),
      },
      include: {
        photos: { orderBy: { sortOrder: "asc" }, take: 1 },
        rooms: {
          where: roomWhere,
          orderBy: { hourlyRateMad: "asc" },
          include: {
            equipment: {
              orderBy: { name: "asc" },
              take: 6,
            },
          },
        },
        amenities: {
          orderBy: { name: "asc" },
          take: 8,
        },
        reviews: { select: { rating: true } },
        _count: {
          select: {
            bookings: true,
            favorites: true,
          },
        },
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
    db.candidateStudio.findMany({
      where: {
        AND: [
          discoveryRolloutWhere("PUBLIC_DISCOVERY"),
          {
            OR: [
              { status: "CONVERTED" },
              { status: "APPROVED", lastCheckedAt: { gte: staleCutoff } },
              {
                status: "ENRICHED",
                phone: { not: null },
                lastCheckedAt: { gte: staleCutoff },
              },
            ],
          },
          ...(city
            ? [{
                OR: [
                  { city: { contains: city, mode: "insensitive" as const } },
                  { district: { contains: city, mode: "insensitive" as const } },
                  { address: { contains: city, mode: "insensitive" as const } },
                ],
              }]
            : []),
          ...(discoveryCategories ? [{ category: { in: discoveryCategories } }] : []),
        ],
      },
      include: {
        convertedStudio: {
          select: { status: true },
        },
        sources: {
          where: { active: true },
          orderBy: { collectedAt: "desc" },
          take: 2,
          select: {
            id: true,
            provider: true,
          },
        },
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      take: 30,
    }),
    db.candidateStudio.findMany({
      where: {
        OR: [
          { status: "CONVERTED" },
          { status: "APPROVED", lastCheckedAt: { gte: staleCutoff } },
          {
            status: "ENRICHED",
            phone: { not: null },
            lastCheckedAt: { gte: staleCutoff },
          },
        ],
      },
      select: { city: true, district: true },
      orderBy: [{ city: "asc" }, { district: "asc" }],
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

  const availableResults = studios.filter((_, index) => availability[index]);

  const ratingFiltered = minRating
    ? availableResults.filter((studio) => {
        if (!studio.reviews.length) return false;
        const average =
          studio.reviews.reduce(
            (sum, review) => sum + review.rating,
            0,
          ) / studio.reviews.length;
        return average >= minRating;
      })
    : availableResults;

  const results = [...ratingFiltered].sort((a, b) => {
    const aPrice = a.rooms[0]?.hourlyRateMad ?? Number.MAX_SAFE_INTEGER;
    const bPrice = b.rooms[0]?.hourlyRateMad ?? Number.MAX_SAFE_INTEGER;
    const aRating = a.reviews.length
      ? a.reviews.reduce((sum, review) => sum + review.rating, 0) /
        a.reviews.length
      : 0;
    const bRating = b.reviews.length
      ? b.reviews.reduce((sum, review) => sum + review.rating, 0) /
        b.reviews.length
      : 0;
    const aCapacity = Math.max(0, ...a.rooms.map((room) => room.capacity));
    const bCapacity = Math.max(0, ...b.rooms.map((room) => room.capacity));
    const aPopularity = a._count.bookings * 2 + a._count.favorites;
    const bPopularity = b._count.bookings * 2 + b._count.favorites;

    if (sort === "price_asc") return aPrice - bPrice;
    if (sort === "price_desc") return bPrice - aPrice;
    if (sort === "rating_desc") return bRating - aRating;
    if (sort === "popular") return bPopularity - aPopularity;
    if (sort === "capacity_desc") return bCapacity - aCapacity;

    const verifiedDifference =
      (b.verifiedAt?.getTime() || 0) -
      (a.verifiedAt?.getTime() || 0);
    return verifiedDifference || a.name.localeCompare(b.name);
  });

  const bookableNameKeys = new Set(
    results.map((studio) => normalizeSearchText(studio.name)),
  );

  const discoveryResults = advancedInventoryFilters
    ? []
    : candidateRows.filter(
        (candidate) =>
          candidate.convertedStudio?.status !== "VERIFIED" &&
          !bookableNameKeys.has(candidate.normalizedName),
      );

  await trackMarketplaceEvent({
    eventType: "DISCOVERY_SEARCH_IMPRESSION",
    userId: user?.id,
    metadata: {
      city,
      category: category || "ANY",
      discoveryResults: discoveryResults.length,
      bookableResults: results.length,
      dateAppliedToBookableOnly: Boolean(date),
      maxPriceAppliedToBookableOnly: Boolean(maxPrice),
      advancedInventoryFilters,
      sort,
    },
  });

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

  const locationSuggestions = Array.from(
    new Set([
      ...locationRows.flatMap((row) => [
        row.city,
        row.neighborhood ? `${row.neighborhood}, ${row.city}` : "",
      ]),
      ...candidateLocationRows.flatMap((row) => [
        row.city || "",
        row.city && row.district ? `${row.district}, ${row.city}` : "",
      ]),
    ]),
  ).filter(Boolean);

  const seoCities = Array.from(
    new Set(
      locationRows
        .map((row) => row.city)
        .filter((value): value is string => Boolean(value)),
    ),
  ).slice(0, 10);

  const detailParams = new URLSearchParams();
  if (date) detailParams.set("date", date);
  detailParams.set("duration", String(durationHours));
  const detailSuffix = "?" + detailParams.toString();

  const returnParams = new URLSearchParams();
  if (category) returnParams.set("category", category);
  if (city) returnParams.set("city", city);
  if (date) returnParams.set("date", date);
  returnParams.set("duration", String(durationHours));
  if (minPrice) returnParams.set("minPrice", String(minPrice));
  if (maxPrice) returnParams.set("maxPrice", String(maxPrice));
  if (capacity) returnParams.set("capacity", String(capacity));
  if (engineerIncluded) returnParams.set("engineer", "1");
  if (equipment) returnParams.set("equipment", equipment);
  if (amenity) returnParams.set("amenity", amenity);
  if (minRating) returnParams.set("minRating", String(minRating));
  if (sort !== "recommended") returnParams.set("sort", sort);
  const returnTo = "/studios?" + returnParams.toString();

  return (
    <main className="min-h-screen bg-white text-[#222]">
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
            <p className="mt-3 text-sm text-[#717171]">
              Search bookable studios or explore creative spaces worldwide on the map.
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
          minPrice={minPrice}
          maxPrice={maxPrice}
          capacity={capacity}
          engineerIncluded={engineerIncluded}
          equipment={equipment}
          amenity={amenity}
          minRating={minRating}
          sort={sort}
          categories={STUDIO_CATEGORIES}
          locationSuggestions={locationSuggestions}
        />

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[#717171]">
            <b className="text-[#222222]">{results.length}</b> bookable studio
            {results.length === 1 ? "" : "s"}
            {date ? ` available for ${durationHours}h` : ""}
            {city ? ` in ${city}` : ""}
            {discoveryResults.length > 0 ? (
              <span className="ml-2 text-sky-600">
                · {discoveryResults.length} discovered
              </span>
            ) : null}
          </p>
          {user?.role === "CREATOR" && (
            <Link href="/creator/requests" className="text-xs font-black text-acid">
              Can&apos;t find it? Post a 36 Request →
            </Link>
          )}
        </div>

        {seoCities.length > 0 && (
          <section className="mt-5 rounded-2xl border border-[#ebebeb] bg-white p-4">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#a3a3a3]">
                Browse verified pages
              </span>
              {seoCities.map((seoCity) => (
                <Link
                  key={seoCity}
                  href={"/studios/in/" + slugify(seoCity)}
                  className="text-xs font-bold text-[#717171] hover:text-acid"
                >
                  {seoCity}
                </Link>
              ))}
            </div>
            {city && (
              <div className="mt-3 flex flex-wrap gap-2 border-t border-[#ebebeb] pt-3">
                {STUDIO_CATEGORIES.map((item) => (
                  <Link
                    key={item.value}
                    href={
                      "/studios/in/" +
                      slugify(city) +
                      "/" +
                      slugify(item.label)
                    }
                    className="rounded-full border border-[#ebebeb] px-3 py-1.5 text-[10px] font-black text-[#8a8a8a] hover:border-acid/30 hover:text-acid"
                  >
                    {item.label} in {city}
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        {results.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-[#dddddd] p-14 text-center">
            <h2 className="text-xl font-black">No matching studios</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#8a8a8a]">
              Try another location, date, category or price ceiling.
            </p>
          </div>
        ) : (
          <div className="mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.05fr)_minmax(460px,.95fr)]">
            <div className="grid gap-5 md:grid-cols-2">
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
                        <div className="aspect-[4/3] overflow-hidden rounded-3xl bg-[#f3f3f3]">
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

                    <div className="flex items-center justify-between gap-3 pt-4">
                      <CompareStudioButton
                        studioId={studio.id}
                        studioName={studio.name}
                      />
                      <span className="text-[10px] text-[#a3a3a3]">
                        {studio.rooms[0]?.capacity || 1} people
                        {studio.rooms.some((room) => room.engineerIncluded)
                          ? " · Engineer included"
                          : ""}
                      </span>
                    </div>

                    <Link href={"/studios/" + studio.slug + detailSuffix} className="block pt-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-black">{studio.name}</h2>
                          <p className="mt-1 text-sm text-[#717171]">
                            {studio.neighborhood || studio.city}, {studio.city}
                          </p>
                          <p className="mt-1 text-xs text-[#8a8a8a]">
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
                        <span className="text-[#717171]"> / hour</span>
                      </p>
                      {(studio.rooms[0]?.equipment.length > 0 ||
                        studio.amenities.length > 0) && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {studio.rooms[0]?.equipment.slice(0, 2).map((item) => (
                            <span
                              key={"equipment-" + item.id}
                              className="rounded-full border border-[#ebebeb] px-2 py-1 text-[9px] text-[#8a8a8a]"
                            >
                              {item.name}
                            </span>
                          ))}
                          {studio.amenities.slice(0, 2).map((item) => (
                            <span
                              key={"amenity-" + item.id}
                              className="rounded-full border border-[#ebebeb] px-2 py-1 text-[9px] text-[#8a8a8a]"
                            >
                              {item.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </Link>
                  </article>
                );
              })}
            </div>

            <aside className="self-start xl:sticky xl:top-24">
              <div className="mb-3 flex items-center justify-between gap-4">
                <div>
                  <b className="block text-sm">Creative spaces map</b>
                  <span className="mt-1 block text-[10px] text-[#8a8a8a]">
                    Bookable + contact-only spaces
                  </span>
                </div>
                <Link
                  href={
                    "/discover" +
                    (city || category
                      ? "?" +
                        new URLSearchParams({
                          ...(city ? { city } : {}),
                          ...(category ? { category } : {}),
                        }).toString()
                      : "")
                  }
                  className="text-[10px] font-black text-[#222] underline underline-offset-4"
                >
                  Open explorer
                </Link>
              </div>

              <CreativeExplorerMap
                filters={{
                  city,
                  category: category || "",
                }}
              />
            </aside>
          </div>
        )}

        {advancedInventoryFilters && candidateRows.length > 0 && (
          <div className="mt-10 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-xs leading-5 text-[#8a8a8a]">
            Contact-only discovery listings are hidden while advanced inventory
            filters are active because they do not have verified room pricing,
            capacity, equipment or rating data.
          </div>
        )}

        {discoveryResults.length > 0 && (
          <section className="mt-12 border-t border-[#ebebeb] pt-9">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="max-w-2xl">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-sky-600">
                  36 Discovery
                </span>
                <h2 className="mt-2 text-2xl font-black">
                  More studios found around this search
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#8a8a8a]">
                  These studios match the location/category search, but they are not bookable on 36 yet.
                  Date availability and maximum-price filters do not apply to discovery listings because no owner-verified inventory or pricing exists yet.
                </p>
              </div>
              <Link href={"/discover?city=" + encodeURIComponent(city)} className="text-xs font-black text-sky-600">
                Open discovery →
              </Link>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {discoveryResults.map((candidate) => (
                <Link
                  key={candidate.id}
                  href={"/discover/" + candidate.slug}
                  className="rounded-2xl border border-sky-100 bg-sky-50 p-5 transition hover:border-sky-200"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full border border-sky-200/50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-sky-600">
                      {candidate.status === "CONVERTED" ? "Owner onboarding" : "Discovered"}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#a3a3a3]">
                      {discoveryCategoryLabel(candidate.category)}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-black">{candidate.name}</h3>
                  <p className="mt-1 text-sm text-[#717171]">
                    {[candidate.district, candidate.city].filter(Boolean).join(", ") || candidate.country || "Location available"}
                  </p>
                  {candidate.phone && (
                    <p className="mt-3 text-sm font-bold text-sky-600">☎ {candidate.phone}</p>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-amber-600">Contact only · not bookable</span>
                    {candidate.sources.map((source) => (
                      <span key={source.id} className="rounded-full border border-[#ebebeb] px-2 py-1 text-[9px] text-[#8a8a8a]">
                        {source.provider}
                      </span>
                    ))}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        <CompareTray date={date} durationHours={durationHours} />
      </section>
    </main>
  );
}
