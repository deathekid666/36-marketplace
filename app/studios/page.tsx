import Link from "next/link";
import type { Prisma, StudioCategory } from "@prisma/client";

import { AppHeader } from "@/components/AppHeader";
import { CreativeExplorerMap } from "@/components/CreativeExplorerMap";
import { MarketplaceSearchBar } from "@/components/MarketplaceSearchBar";
import { CompareStudioButton } from "@/components/CompareStudioButton";
import { CompareTray } from "@/components/CompareTray";
import { toggleFavoriteAction } from "@/app/favorites/actions";
import { getCurrentUser, hasCreatorAccess } from "@/lib/auth";
import { getRoomAvailability } from "@/lib/booking";
import { db } from "@/lib/db";
import { trackMarketplaceEvent } from "@/lib/analytics";
import { discoveryCategoriesForStudioCategory } from "@/lib/discovery/search";
import { discoveryStaleCutoff } from "@/lib/discovery/freshness";
import { discoveryRolloutWhere } from "@/lib/discovery/rollout";
import { normalizeSearchText } from "@/lib/discovery/normalization";
import { categoryLabel, slugify, STUDIO_CATEGORIES } from "@/lib/studio";
import { formatMoney, normalizeCurrency } from "@/lib/commerce";

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
    currency?: string;
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
  const priceCurrency = normalizeCurrency(query.currency, "");
  const capacity = parsePositiveInt(query.capacity, 500);
  const engineerIncluded = query.engineer === "1";
  const equipment = String(query.equipment || "").trim().slice(0, 100);
  const amenity = String(query.amenity || "").trim().slice(0, 100);
  const minRating = parseRating(query.minRating);
  const sort = parseSort(query.sort);

  const roomWhere: Prisma.RoomWhereInput = {
    active: true,
    ...(category ? { category } : {}),
    ...(priceCurrency && (minPrice || maxPrice)
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
    priceCurrency ||
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
      currency: priceCurrency || null,
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
        ...(priceCurrency ? { currency: priceCurrency } : {}),
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
      select: {
        id: true,
        normalizedName: true,
        convertedStudio: {
          select: { status: true },
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

  const effectiveSort =
    ["price_asc", "price_desc"].includes(sort) && !priceCurrency
      ? "recommended"
      : sort;

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

    if (effectiveSort === "price_asc") return aPrice - bPrice;
    if (effectiveSort === "price_desc") return bPrice - aPrice;
    if (effectiveSort === "rating_desc") return bRating - aRating;
    if (effectiveSort === "popular") return bPopularity - aPopularity;
    if (effectiveSort === "capacity_desc") return bCapacity - aCapacity;

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
      currency: priceCurrency || null,
      advancedInventoryFilters,
      sort: effectiveSort,
    },
  });

  const favoriteIds =
    user && hasCreatorAccess(user.role)
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
  if (priceCurrency) returnParams.set("currency", priceCurrency);
  if (capacity) returnParams.set("capacity", String(capacity));
  if (engineerIncluded) returnParams.set("engineer", "1");
  if (equipment) returnParams.set("equipment", equipment);
  if (amenity) returnParams.set("amenity", amenity);
  if (minRating) returnParams.set("minRating", String(minRating));
  if (sort !== "recommended") returnParams.set("sort", sort);
  const returnTo = "/studios?" + returnParams.toString();

  const discoverParams = new URLSearchParams();
  if (city) discoverParams.set("city", city);
  const discoverCategory = discoveryCategories?.[0];
  if (
    discoverCategory &&
    ["RECORDING", "PODCAST", "PHOTO", "VIDEO", "REHEARSAL", "IMAGE_LAB", "VOICE_OVER", "OTHER"].includes(
      discoverCategory,
    )
  ) {
    discoverParams.set("category", discoverCategory);
  }
  const discoverHref =
    "/discover" + (discoverParams.toString() ? "?" + discoverParams.toString() : "");

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
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#717171]">
              Studios is the bookable 36 marketplace: owner-verified spaces with live
              rooms, pricing and availability. For the wider global directory,{" "}
              <Link href={discoverHref} className="font-bold text-[#222] underline underline-offset-4">
                use Discover
              </Link>
              .
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
          currency={priceCurrency}
          capacity={capacity}
          engineerIncluded={engineerIncluded}
          equipment={equipment}
          amenity={amenity}
          minRating={minRating}
          sort={effectiveSort}
          categories={STUDIO_CATEGORIES}
          locationSuggestions={locationSuggestions}
        />

        <div className="mt-7 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[#717171]">
            <span>
              <b className="text-[#222222]">{results.length}</b> bookable studio
              {results.length === 1 ? "" : "s"}
              {date ? ` available for ${durationHours}h` : ""}
              {city ? ` in ${city}` : ""}
            </span>
            {discoveryResults.length > 0 ? (
              <Link
                href={discoverHref}
                className="font-bold text-sky-600 underline underline-offset-4"
              >
                Explore {discoveryResults.length} directory match
                {discoveryResults.length === 1 ? "" : "es"} in Discover →
              </Link>
            ) : null}
          </div>
          {Boolean(user && hasCreatorAccess(user.role)) && (
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
            <h2 className="text-xl font-black">No bookable studios match this search</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#8a8a8a]">
              Try another location, date, category or marketplace filter.
            </p>
            {discoveryResults.length > 0 && (
              <Link
                href={discoverHref}
                className="mt-5 inline-flex rounded-full border border-sky-200 bg-sky-50 px-5 py-3 text-xs font-black text-sky-700"
              >
                {discoveryResults.length} directory space
                {discoveryResults.length === 1 ? "" : "s"} found · Explore in Discover →
              </Link>
            )}
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

                      {Boolean(
                        user &&
                          hasCreatorAccess(user.role) &&
                          studio.ownerId !== user.id,
                      ) && (
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
                        <b>{minRate ? formatMoney(minRate, studio.currency) : "—"}</b>
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
                  <b className="block text-sm">Worldwide creative spaces</b>
                  <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-[#8a8a8a]">
                    <span className="inline-flex items-center gap-1.5">
                      <i className="h-2 w-2 rounded-full bg-acid" />
                      Bookable on 36
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <i className="h-2 w-2 rounded-full bg-[#b8b8b8]" />
                      Directory only
                    </span>
                  </div>
                </div>
                <Link
                  href={discoverHref}
                  className="text-[10px] font-black text-[#222] underline underline-offset-4"
                >
                  Open Discover
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

        <CompareTray date={date} durationHours={durationHours} />
      </section>
    </main>
  );
}
