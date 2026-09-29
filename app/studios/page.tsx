import Link from "next/link";
import type { StudioCategory } from "@prisma/client";

import { AppHeader } from "@/components/AppHeader";
import { StudioMap } from "@/components/StudioMap";
import { toggleFavoriteAction } from "@/app/favorites/actions";
import { getCurrentUser } from "@/lib/auth";
import { getRoomAvailability } from "@/lib/booking";
import { db } from "@/lib/db";
import { trackMarketplaceEvent } from "@/lib/analytics";
import { categoryLabel, STUDIO_CATEGORIES } from "@/lib/studio";

function parseCategory(value?: string): StudioCategory | undefined {
  return STUDIO_CATEGORIES.some((item) => item.value === value) ? (value as StudioCategory) : undefined;
}

function parseDuration(value?: string) {
  const number = Math.round(Number(value || "1"));
  return Number.isFinite(number) ? Math.max(1, Math.min(12, number)) : 1;
}

export default async function StudiosPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; city?: string; date?: string; duration?: string; maxPrice?: string }>;
}) {
  const user = await getCurrentUser();
  const query = await searchParams;
  const category = parseCategory(query.category);
  const city = String(query.city || "Casablanca").trim();
  const date = /^\\d{4}-\\d{2}-\\d{2}$/.test(String(query.date || "")) ? String(query.date) : "";
  const durationHours = parseDuration(query.duration);
  const parsedMax = Math.round(Number(query.maxPrice || "0"));
  const maxPrice = Number.isFinite(parsedMax) && parsedMax > 0 ? parsedMax : undefined;

  await trackMarketplaceEvent({
    eventType: "SEARCH",
    userId: user?.id,
    metadata: { city, category: category || "ANY", date: date || null, durationHours, maxPrice: maxPrice || null },
  });

  const studios = await db.studio.findMany({
    where: {
      status: "VERIFIED",
      ...(city ? { city: { contains: city, mode: "insensitive" as const } } : {}),
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
  });

  const availability = date
    ? await Promise.all(
        studios.map(async (studio) => {
          const checks = await Promise.all(
            studio.rooms.map((room) => getRoomAvailability(room.id, date, durationHours * 60)),
          );
          return checks.some((slots) => slots.length > 0);
        }),
      )
    : studios.map(() => true);

  const results = studios.filter((_, index) => availability[index]);

  const favoriteIds = user?.role === "CREATOR"
    ? new Set(
        (await db.favorite.findMany({
          where: { userId: user.id, studioId: { in: results.map((studio) => studio.id) } },
          select: { studioId: true },
        })).map((favorite) => favorite.studioId),
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
      <section className="mx-auto max-w-7xl px-5 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-acid">Marketplace</span>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">Find a studio</h1>
            <p className="mt-3 text-sm text-zinc-500">Verified creative spaces, transparent prices and live availability.</p>
          </div>
          <Link href="/now" className="rounded-full border border-acid/30 px-5 py-3 text-xs font-black text-acid">⚡ 36 NOW</Link>
        </div>

        <form action="/studios" method="GET" className="mt-8 grid gap-3 rounded-2xl border border-zinc-900 bg-zinc-950/70 p-4 md:grid-cols-5">
          <label><span className="label">Category</span><select className="field" name="category" defaultValue={category || ""}><option value="">All spaces</option>{STUDIO_CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
          <label><span className="label">City</span><input className="field" name="city" defaultValue={city} /></label>
          <label><span className="label">Date</span><input className="field" type="date" name="date" defaultValue={date} /></label>
          <label><span className="label">Duration</span><select className="field" name="duration" defaultValue={String(durationHours)}>{[1,2,3,4,5,6,8,10,12].map((hours) => <option key={hours} value={hours}>{hours}h</option>)}</select></label>
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <label><span className="label">Max MAD/h</span><input className="field" type="number" min="1" name="maxPrice" defaultValue={maxPrice || ""} placeholder="Any" /></label>
            <button className="self-end rounded-xl bg-acid px-5 py-3 text-sm font-black text-black">Search</button>
          </div>
        </form>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-500"><b className="text-zinc-200">{results.length}</b> verified studio{results.length === 1 ? "" : "s"}{date ? " available for " + durationHours + "h" : ""}</p>
          {user?.role === "CREATOR" && <Link href="/creator/requests" className="text-xs font-black text-acid">Can&apos;t find it? Post a 36 Request →</Link>}
        </div>

        {mapPoints.length > 0 && <div className="mt-6"><StudioMap points={mapPoints} /></div>}

        {results.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-zinc-800 p-12 text-center">
            <h2 className="text-xl font-black">No matching studios</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-zinc-600">Try another date, category or price ceiling. Creators can also post a 36 Request.</p>
          </div>
        ) : (
          <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {results.map((studio) => {
              const photo = studio.photos[0]?.url;
              const minRate = studio.rooms[0]?.hourlyRateMad;
              const average = studio.reviews.length ? studio.reviews.reduce((sum, review) => sum + review.rating, 0) / studio.reviews.length : null;
              const saved = favoriteIds.has(studio.id);
              return (
                <article key={studio.id} className="overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950/70">
                  <Link href={"/studios/" + studio.slug + detailSuffix}>
                    <div className="h-52 bg-zinc-900">{photo ? <img src={photo} alt={studio.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-4xl font-black text-acid">36</div>}</div>
                    <div className="p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-acid">{categoryLabel(studio.primaryCategory)}</span>
                          <h2 className="mt-2 text-xl font-black">{studio.name}</h2>
                          <p className="mt-1 text-xs text-zinc-600">{studio.neighborhood || studio.city}</p>
                        </div>
                        <div className="text-right"><b className="text-lg">{minRate ? minRate + " MAD" : "—"}</b><span className="block text-[10px] text-zinc-600">from / hour</span></div>
                      </div>
                      <div className="mt-4 flex items-center justify-between text-xs">
                        <span className="text-zinc-500">{average ? "★ " + average.toFixed(1) + " · " + studio.reviews.length + " reviews" : "New on 36"}</span>
                        {date && <span className="font-bold text-acid">Available</span>}
                      </div>
                    </div>
                  </Link>
                  {user?.role === "CREATOR" && (
                    <form action={toggleFavoriteAction} className="border-t border-zinc-900 p-4">
                      <input type="hidden" name="studioId" value={studio.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <button className="text-xs font-bold text-zinc-500 hover:text-acid">{saved ? "♥ Saved" : "♡ Save studio"}</button>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
