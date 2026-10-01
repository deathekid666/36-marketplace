import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { BookingWidget } from "@/components/BookingWidget";
import { StudioMap } from "@/components/StudioMap";
import { StudioRecommendations } from "@/components/StudioRecommendations";
import { toggleFavoriteAction } from "@/app/favorites/actions";
import { getCurrentUser } from "@/lib/auth";
import { trackMarketplaceEvent } from "@/lib/analytics";
import { db } from "@/lib/db";
import { DAYS, categoryLabel } from "@/lib/studio";
import { getStudioRecommendations } from "@/lib/recommendations";
import {
  getStudioTrustMetrics,
  responseTimeLabel,
} from "@/lib/trust";

function safeDate(value?: string) {
  return /^\\d{4}-\\d{2}-\\d{2}$/.test(String(value || "")) ? String(value) : undefined;
}

function safeDuration(value?: string) {
  const number = Math.round(Number(value || "1"));
  return Number.isFinite(number) ? Math.max(1, Math.min(12, number)) : undefined;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  const studio = await db.studio.findFirst({
    where: { slug, status: "VERIFIED" },
    select: {
      name: true,
      city: true,
      neighborhood: true,
      description: true,
      photos: {
        orderBy: { sortOrder: "asc" },
        take: 1,
        select: { url: true },
      },
      rooms: {
        where: { active: true },
        orderBy: { hourlyRateMad: "asc" },
        take: 1,
        select: { hourlyRateMad: true },
      },
    },
  });

  if (!studio) {
    return {
      title: "Studio not found",
      robots: { index: false, follow: false },
    };
  }

  const location = studio.neighborhood || studio.city;
  const price = studio.rooms[0]?.hourlyRateMad;
  const description =
    studio.description.trim().slice(0, 155) ||
    "Book " +
      studio.name +
      " in " +
      studio.city +
      (price ? " from " + price + " MAD/hour" : "") +
      " on 36.";

  return {
    title: studio.name + " in " + location,
    description,
    alternates: {
      canonical: "/studios/" + slug,
    },
    openGraph: {
      title: studio.name + " · 36",
      description,
      type: "website",
      images: studio.photos[0]?.url
        ? [{ url: studio.photos[0].url }]
        : undefined,
    },
  };
}

export default async function StudioDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ date?: string; duration?: string; startAt?: string }>;
}) {
  const user = await getCurrentUser();
  const { slug } = await params;
  const query = await searchParams;

  const studio = await db.studio.findFirst({
    where: { slug, status: "VERIFIED" },
    include: {
      photos: { orderBy: { sortOrder: "asc" } },
      amenities: { orderBy: { name: "asc" } },
      openingHours: { orderBy: { dayOfWeek: "asc" } },
      rooms: {
        where: { active: true },
        include: { equipment: { orderBy: { name: "asc" } } },
        orderBy: { hourlyRateMad: "asc" },
      },
      addons: { where: { active: true }, orderBy: { unitPriceMad: "asc" } },
      reviews: {
        include: { creator: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
    },
  });

  if (!studio) notFound();

  await trackMarketplaceEvent({ eventType: "STUDIO_VIEW", userId: user?.id, studioId: studio.id });

  const saved = user?.role === "CREATOR"
    ? Boolean(await db.favorite.findUnique({
        where: { userId_studioId: { userId: user.id, studioId: studio.id } },
        select: { id: true },
      }))
    : false;

  const average = studio.reviews.length
    ? studio.reviews.reduce((sum, review) => sum + review.rating, 0) / studio.reviews.length
    : null;
  const trust = await getStudioTrustMetrics(studio.id, studio.ownerId);
  const responseLabel =
    trust.responseSampleSize >= 3
      ? responseTimeLabel(trust.typicalResponseMinutes)
      : null;

  const recommendationDate = safeDate(query.date);
  const recommendationDuration =
    safeDuration(query.duration) || 1;
  const recommendations = await getStudioRecommendations(
    {
      id: studio.id,
      city: studio.city,
      primaryCategory: studio.primaryCategory,
      latitude:
        studio.latitude != null
          ? Number(studio.latitude)
          : null,
      longitude:
        studio.longitude != null
          ? Number(studio.longitude)
          : null,
      rooms: studio.rooms.map((room) => ({
        hourlyRateMad: room.hourlyRateMad,
        equipment: room.equipment.map((item) => ({
          name: item.name,
        })),
      })),
      amenities: studio.amenities.map((item) => ({
        name: item.name,
      })),
    },
    {
      date: recommendationDate,
      durationHours: recommendationDuration,
    },
  );

  const mapPoints = studio.latitude != null && studio.longitude != null
    ? [{
        id: studio.id,
        name: studio.name,
        lat: Number(studio.latitude),
        lng: Number(studio.longitude),
        href: "/studios/" + studio.slug,
        price: studio.rooms[0]?.hourlyRateMad || null,
      }]
    : [];

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-5 py-10">
        <Link href="/studios" className="text-xs font-bold text-zinc-500 hover:text-white">← Back to studios</Link>

        <div className="mt-6 flex flex-wrap items-start justify-between gap-5">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-acid">✓ Verified · {categoryLabel(studio.primaryCategory)}</span>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">{studio.name}</h1>
            <p className="mt-2 text-sm text-zinc-500">{studio.neighborhood || studio.city} · {studio.city}{average ? " · ★ " + average.toFixed(1) + " (" + studio.reviews.length + ")" : " · New on 36"}</p>
          </div>
          {user?.role === "CREATOR" && (
            <form action={toggleFavoriteAction}>
              <input type="hidden" name="studioId" value={studio.id} />
              <input type="hidden" name="returnTo" value={"/studios/" + studio.slug} />
              <button className="rounded-full border border-zinc-800 px-5 py-3 text-xs font-black text-zinc-300 hover:border-acid/40 hover:text-acid">{saved ? "♥ Saved" : "♡ Save studio"}</button>
            </form>
          )}
        </div>

        <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950/60 p-4">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-acid">
              36 verified
            </span>
            <b className="mt-2 block text-sm">Identity & listing reviewed</b>
          </div>
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950/60 p-4">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
              Completed sessions
            </span>
            <b className="mt-2 block text-2xl">{trust.completedSessions}</b>
          </div>
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950/60 p-4">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
              Verified reviews
            </span>
            <b className="mt-2 block text-sm">
              {trust.verifiedReviewCount > 0 && trust.averageRating != null
                ? "★ " + trust.averageRating.toFixed(1) + " · " + trust.verifiedReviewCount
                : "New on 36"}
            </b>
          </div>
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950/60 p-4">
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
              Studio response
            </span>
            <b className="mt-2 block text-sm">
              {trust.responseSampleSize >= 3 && trust.responseRate != null
                ? trust.responseRate + "% response rate"
                : "Response history building"}
            </b>
            {responseLabel && (
              <span className="mt-1 block text-[10px] text-zinc-600">
                {responseLabel}
              </span>
            )}
          </div>
        </section>

        <div className="mt-8 grid gap-3 md:grid-cols-12">
          {(studio.photos.length ? studio.photos.slice(0, 5) : [null]).map((photo, index) => (
            <div key={photo?.id || "placeholder"} className={"overflow-hidden rounded-2xl bg-zinc-900 " + (index === 0 ? "h-80 md:col-span-8 md:row-span-2 md:h-[500px]" : "h-60 md:col-span-4 md:h-[244px]")}>
              {photo ? <img src={photo.url} alt={photo.alt || studio.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-6xl font-black text-acid">36</div>}
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1fr_410px]">
          <div className="space-y-8">
            <section className="panel">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-acid">About</span>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-400">{studio.description || "Studio details coming soon."}</p>
              {studio.amenities.length > 0 && <div className="mt-6 flex flex-wrap gap-2">{studio.amenities.map((amenity) => <span key={amenity.id} className="rounded-full border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400">{amenity.name}</span>)}</div>}
            </section>

            <section>
              <div className="flex items-end justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[0.16em] text-acid">Rooms</span><h2 className="mt-2 text-3xl font-black">Choose your setup</h2></div><span className="text-xs text-zinc-600">MAD / hour</span></div>
              <div className="mt-5 space-y-4">
                {studio.rooms.map((room) => (
                  <article key={room.id} className="panel">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-acid">{categoryLabel(room.category)}</span><h3 className="mt-2 text-xl font-black">{room.name}</h3><p className="mt-1 text-xs text-zinc-600">Capacity {room.capacity} · Minimum {room.minimumHours}h · Engineer {room.engineerIncluded ? "included" : "not included"}</p></div>
                      <div className="text-right"><b className="text-2xl">{room.hourlyRateMad} MAD</b><span className="block text-[10px] text-zinc-600">per hour</span></div>
                    </div>
                    {room.description && <p className="mt-4 text-sm leading-6 text-zinc-500">{room.description}</p>}
                    {room.equipment.length > 0 && <div className="mt-4 flex flex-wrap gap-2">{room.equipment.map((item) => <span key={item.id} className="rounded-full bg-black/30 px-3 py-1.5 text-[11px] text-zinc-500">{item.name}{item.quantity > 1 ? " ×" + item.quantity : ""}</span>)}</div>}
                  </article>
                ))}
              </div>
            </section>

            <section className="panel">
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-acid">Opening hours</span>
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                {DAYS.map((day, index) => {
                  const row = studio.openingHours.find((hour) => hour.dayOfWeek === index);
                  return <div key={day} className="flex justify-between rounded-xl bg-black/25 px-4 py-3 text-xs"><b>{day}</b><span className="text-zinc-500">{!row || row.closed ? "Closed" : row.opensAt + " – " + row.closesAt}</span></div>;
                })}
              </div>
            </section>

            <section>
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-acid">Location</span>
              <h2 className="mt-2 text-3xl font-black">
                {studio.neighborhood ? `${studio.neighborhood}, ${studio.city}` : studio.city}
              </h2>
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-zinc-900 bg-zinc-950/70 p-5">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-acid text-lg font-black text-black">⌖</div>
                <div>
                  <b className="text-sm">{studio.address || studio.city}</b>
                  <p className="mt-1 text-xs leading-5 text-zinc-600">
                    Exact location is shown here when the studio owner provides map coordinates.
                  </p>
                </div>
              </div>
              {mapPoints.length > 0 && (
                <div className="mt-5">
                  <StudioMap points={mapPoints} />
                </div>
              )}
            </section>

            <section>
              <div className="flex items-end justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[0.16em] text-acid">Verified stays</span><h2 className="mt-2 text-3xl font-black">Reviews</h2></div>{average && <b className="text-xl text-acid">★ {average.toFixed(1)}</b>}</div>
              {trust.verifiedReviewCount > 0 && (
                <div className="mt-5 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-zinc-900 bg-black/20 p-3 text-xs">
                    <span className="text-zinc-600">Accuracy</span>
                    <b className="float-right">{trust.averageAccuracy?.toFixed(1) || "—"}</b>
                  </div>
                  <div className="rounded-xl border border-zinc-900 bg-black/20 p-3 text-xs">
                    <span className="text-zinc-600">Equipment</span>
                    <b className="float-right">{trust.averageEquipment?.toFixed(1) || "—"}</b>
                  </div>
                  <div className="rounded-xl border border-zinc-900 bg-black/20 p-3 text-xs">
                    <span className="text-zinc-600">Communication</span>
                    <b className="float-right">{trust.averageCommunication?.toFixed(1) || "—"}</b>
                  </div>
                </div>
              )}
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                {studio.reviews.length === 0 ? <div className="panel text-sm text-zinc-600">No verified reviews yet.</div> : studio.reviews.map((review) => (
                  <article key={review.id} className="panel">
                    <div className="flex justify-between gap-3"><b className="text-sm">{review.creator.name}</b><span className="text-sm text-acid">{"★".repeat(review.rating)}</span></div>
                    {review.comment && <p className="mt-3 text-sm leading-6 text-zinc-500">{review.comment}</p>}
                    {review.ownerReply && <div className="mt-4 rounded-xl bg-black/30 p-3"><b className="text-[10px] uppercase tracking-[0.12em] text-zinc-600">Studio reply</b><p className="mt-2 text-xs leading-5 text-zinc-500">{review.ownerReply}</p></div>}
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="self-start lg:sticky lg:top-6">
            <section className="rounded-3xl border border-zinc-800 bg-[#11120f] p-6 shadow-[0_24px_70px_rgba(0,0,0,.45)]">
              <div className="mb-5">
                <span className="text-xs font-bold uppercase tracking-[0.16em] text-acid">Instant booking</span>
                <h2 className="mt-2 text-2xl font-black">Reserve your studio session</h2>
                <p className="mt-2 text-xs leading-5 text-zinc-600">
                  Deposit {studio.depositPercent}% · Free cancellation up to {studio.freeCancellationHours}h before the session.
                </p>
              </div>
              <BookingWidget
                  rooms={studio.rooms.map((room) => ({ id: room.id, name: room.name, hourlyRateMad: room.hourlyRateMad, minimumHours: room.minimumHours, engineerIncluded: room.engineerIncluded }))}
                  addons={studio.addons.map((addon) => ({ id: addon.id, roomId: addon.roomId, name: addon.name, description: addon.description, unitPriceMad: addon.unitPriceMad, unitLabel: addon.unitLabel }))}
                  userRole={user?.role || null}
                  depositPercent={studio.depositPercent}
                  taxRateBps={studio.taxRateBps}
                  initialDate={safeDate(query.date)}
                  initialDurationHours={safeDuration(query.duration)}
                  initialStartAt={query.startAt}
                  locationLabel={studio.neighborhood ? `${studio.neighborhood}, ${studio.city}` : studio.city}
                />
            </section>
          </aside>
        </div>

        <StudioRecommendations
          similar={recommendations.similar}
          cheaper={recommendations.cheaper}
          nearby={recommendations.nearby}
          available={recommendations.available}
          date={recommendationDate}
          durationHours={recommendationDuration}
        />
      </section>
    </main>
  );
}
