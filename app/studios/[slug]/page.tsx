import type { Metadata } from "next";
import Link from "next/link";

import { studioTimeZone } from "@/lib/time";
import { notFound } from "next/navigation";

import { toggleFavoriteAction } from "@/app/favorites/actions";
import { AppHeader } from "@/components/AppHeader";
import { BookingWidget } from "@/components/BookingWidget";
import { StudioMap } from "@/components/StudioMap";
import { StudioProfileGallery } from "@/components/StudioProfileGallery";
import { StudioRecommendations } from "@/components/StudioRecommendations";
import { getCurrentUser } from "@/lib/auth";
import { trackMarketplaceEvent } from "@/lib/analytics";
import { db } from "@/lib/db";
import { getStudioRecommendations } from "@/lib/recommendations";
import { DAYS, categoryLabel } from "@/lib/studio";
import {
  getStudioTrustMetrics,
  responseTimeLabel,
} from "@/lib/trust";

function safeDate(value?: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))
    ? String(value)
    : undefined;
}

function safeDuration(value?: string) {
  const number = Math.round(Number(value || "1"));
  return Number.isFinite(number)
    ? Math.max(1, Math.min(12, number))
    : undefined;
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
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
  searchParams: Promise<{
    date?: string;
    duration?: string;
    startAt?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const { slug } = await params;
  const query = await searchParams;

  const studio = await db.studio.findFirst({
    where: { slug, status: "VERIFIED" },
    include: {
      owner: {
        select: {
          id: true,
          name: true,
          createdAt: true,
        },
      },
      photos: { orderBy: { sortOrder: "asc" } },
      amenities: { orderBy: { name: "asc" } },
      openingHours: { orderBy: { dayOfWeek: "asc" } },
      rooms: {
        where: { active: true },
        include: {
          equipment: { orderBy: { name: "asc" } },
        },
        orderBy: { hourlyRateMad: "asc" },
      },
      addons: {
        where: { active: true },
        orderBy: { unitPriceMad: "asc" },
      },
      reviews: {
        include: {
          creator: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
    },
  });

  if (!studio) notFound();

  await trackMarketplaceEvent({
    eventType: "STUDIO_VIEW",
    userId: user?.id,
    studioId: studio.id,
  });

  const [saved, creatorBooking] = await Promise.all([
    user?.role === "CREATOR"
      ? db.favorite
          .findUnique({
            where: {
              userId_studioId: {
                userId: user.id,
                studioId: studio.id,
              },
            },
            select: { id: true },
          })
          .then(Boolean)
      : Promise.resolve(false),
    user?.role === "CREATOR"
      ? db.booking.findFirst({
          where: {
            creatorId: user.id,
            studioId: studio.id,
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  const average = studio.reviews.length
    ? studio.reviews.reduce(
        (sum, review) => sum + review.rating,
        0,
      ) / studio.reviews.length
    : null;

  const trust = await getStudioTrustMetrics(
    studio.id,
    studio.ownerId,
  );
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

  const publicLatitude =
    studio.latitude != null
      ? Math.round(Number(studio.latitude) * 100) / 100
      : null;
  const publicLongitude =
    studio.longitude != null
      ? Math.round(Number(studio.longitude) * 100) / 100
      : null;

  const mapPoints =
    publicLatitude != null && publicLongitude != null
      ? [
          {
            id: studio.id,
            name: studio.name,
            lat: publicLatitude,
            lng: publicLongitude,
            href: "/studios/" + studio.slug,
            price:
              studio.rooms[0]?.hourlyRateMad || null,
            kind: "BOOKABLE" as const,
            category: categoryLabel(
              studio.primaryCategory,
            ),
            rating: average,
            photoUrl: studio.photos[0]?.url || null,
          },
        ]
      : [];

  const maxCapacity = Math.max(
    0,
    ...studio.rooms.map((room) => room.capacity),
  );
  const minPrice =
    studio.rooms[0]?.hourlyRateMad || null;
  const hostYear = new Intl.DateTimeFormat("en", {
    year: "numeric",
    timeZone: "UTC",
  }).format(studio.owner.createdAt);

  return (
    <main className="min-h-screen bg-white text-[#222]">
      <AppHeader user={user} />

      <section className="mx-auto max-w-7xl px-5 pb-16 pt-7">
        <div className="flex items-center justify-between gap-4">
          <Link
            href="/studios"
            className="text-xs font-bold text-[#717171] hover:text-[#222222]"
          >
            ← All studios
          </Link>

          <div className="flex items-center gap-2">
            {creatorBooking && (
              <Link
                href={
                  "/messages?booking=" +
                  creatorBooking.id
                }
                className="rounded-full border border-[#dddddd] px-4 py-2 text-xs font-black text-[#333333] hover:border-[#bdbdbd]"
              >
                Message
              </Link>
            )}

            {user?.role === "CREATOR" && (
              <form action={toggleFavoriteAction}>
                <input
                  type="hidden"
                  name="studioId"
                  value={studio.id}
                />
                <input
                  type="hidden"
                  name="returnTo"
                  value={"/studios/" + studio.slug}
                />
                <button className="rounded-full border border-[#dddddd] px-4 py-2 text-xs font-black text-[#333333] hover:border-[#bdbdbd]">
                  {saved ? "♥ Saved" : "♡ Save"}
                </button>
              </form>
            )}
          </div>
        </div>

        <div className="mt-6">
          <h1 className="max-w-4xl text-4xl font-black tracking-[-0.05em] sm:text-5xl">
            {studio.name}
          </h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            {average ? (
              <>
                <b>★ {average.toFixed(2)}</b>
                <span className="text-[#a3a3a3]">·</span>
                <a
                  href="#reviews"
                  className="font-bold underline decoration-[#bdbdbd] underline-offset-4"
                >
                  {studio.reviews.length} review
                  {studio.reviews.length === 1
                    ? ""
                    : "s"}
                </a>
              </>
            ) : (
              <b>New on 36</b>
            )}
            <span className="text-[#a3a3a3]">·</span>
            <span className="font-bold text-acid">
              ✓ Verified
            </span>
            <span className="text-[#a3a3a3]">·</span>
            <a
              href="#location"
              className="font-semibold underline decoration-[#bdbdbd] underline-offset-4"
            >
              {studio.neighborhood
                ? studio.neighborhood + ", "
                : ""}
              {studio.city}
            </a>
          </div>
        </div>

        <StudioProfileGallery
          studioName={studio.name}
          photos={studio.photos.map((photo) => ({
            id: photo.id,
            url: photo.url,
            alt: photo.alt,
          }))}
        />

        <nav className="studio-detail-anchor-nav" aria-label="Studio sections">
          <a href="#about">About</a>
          <a href="#amenities">Amenities</a>
          <a href="#rooms">Rooms</a>
          <a href="#reviews">Reviews</a>
          <a href="#location">Location</a>
        </nav>

        <div className="studio-detail-content-grid">
          <div className="min-w-0">
            <section className="studio-detail-host-summary">
              <div>
                <h2 className="text-2xl font-black">
                  {categoryLabel(
                    studio.primaryCategory,
                  )}{" "}
                  studio hosted by{" "}
                  <Link
                    href={"/profile/" + studio.owner.id}
                    className="underline decoration-[#bdbdbd] underline-offset-4 hover:text-acid"
                  >
                    {studio.owner.name}
                  </Link>
                </h2>
                <p className="mt-2 text-sm text-[#717171]">
                  {studio.rooms.length} room
                  {studio.rooms.length === 1 ? "" : "s"}
                  {maxCapacity
                    ? " · Up to " +
                      maxCapacity +
                      " people"
                    : ""}
                  {studio.rooms.some(
                    (room) => room.engineerIncluded,
                  )
                    ? " · Engineer available"
                    : ""}
                </p>
              </div>

              <Link
                href={"/profile/" + studio.owner.id}
                className="studio-detail-host-avatar"
                aria-label={"View " + studio.owner.name + "'s profile"}
              >
                {initials(studio.owner.name) || "36"}
              </Link>
            </section>

            <section className="studio-detail-trust-row">
              <div className="flex gap-3">
                <span className="text-lg">✓</span>
                <div>
                  <b className="text-sm">
                    36 verified
                  </b>
                  <p className="mt-1 text-xs leading-5 text-[#8a8a8a]">
                    Identity and listing reviewed.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="text-lg">★</span>
                <div>
                  <b className="text-sm">
                    {trust.verifiedReviewCount
                      ? trust.averageRating?.toFixed(1) +
                        " rating"
                      : "New studio"}
                  </b>
                  <p className="mt-1 text-xs leading-5 text-[#8a8a8a]">
                    {trust.verifiedReviewCount
                      ? trust.verifiedReviewCount +
                        " verified review" +
                        (trust.verifiedReviewCount === 1
                          ? ""
                          : "s")
                      : "Review history is building."}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <span className="text-lg">↗</span>
                <div>
                  <b className="text-sm">
                    {trust.responseSampleSize >= 3 &&
                    trust.responseRate != null
                      ? trust.responseRate +
                        "% response rate"
                      : "Responsive host"}
                  </b>
                  <p className="mt-1 text-xs leading-5 text-[#8a8a8a]">
                    {responseLabel ||
                      "Response history is building."}
                  </p>
                </div>
              </div>
            </section>

            <section id="about" className="studio-detail-section">
              <div className="studio-detail-section-heading">
                <span>About</span>
                <h2>About this studio</h2>
              </div>
              <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-[#555555]">
                {studio.description ||
                  "The studio owner has not added a full description yet."}
              </p>
            </section>

            <section id="amenities" className="studio-detail-section">
              <div className="studio-detail-section-heading">
                <span>Amenities</span>
                <h2>What this studio offers</h2>
              </div>

              {studio.amenities.length ? (
                <div className="studio-detail-amenities-grid">
                  {studio.amenities.map(
                    (amenity) => (
                      <div
                        key={amenity.id}
                        className="studio-detail-amenity"
                      >
                        <span className="studio-detail-amenity-icon">
                          ✓
                        </span>
                        {amenity.name}
                      </div>
                    ),
                  )}
                </div>
              ) : (
                <p className="mt-4 text-sm text-[#8a8a8a]">
                  Amenities have not been listed yet.
                </p>
              )}
            </section>

            <section id="rooms" className="studio-detail-section">
              <div className="studio-detail-section-heading">
                <span>Rooms</span>
                <h2>Choose your setup</h2>
                <p>Select the room that fits your session. Final availability is checked in the booking panel.</p>
              </div>

              <div className="studio-detail-room-list">
                {studio.rooms.map((room) => (
                  <article
                    key={room.id}
                    className="studio-detail-room-card"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <span className="studio-detail-room-category">
                          {categoryLabel(room.category)}
                        </span>
                        <h3 className="mt-2 text-xl font-black">
                          {room.name}
                        </h3>
                        <p className="mt-2 text-xs text-[#8a8a8a]">
                          {room.capacity} guest
                          {room.capacity === 1
                            ? ""
                            : "s"}{" "}
                          · Minimum {room.minimumHours}h
                          {room.engineerIncluded
                            ? " · Engineer included"
                            : ""}
                        </p>
                      </div>

                      <div className="studio-detail-room-price">
                        <b>{room.hourlyRateMad} MAD</b>
                        <span>/ hour</span>
                      </div>
                    </div>

                    {room.description && (
                      <p className="mt-4 text-sm leading-6 text-[#717171]">
                        {room.description}
                      </p>
                    )}

                    {room.equipment.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {room.equipment.map(
                          (item) => (
                            <span
                              key={item.id}
                              className="studio-detail-equipment-chip"
                            >
                              {item.name}
                              {item.quantity > 1
                                ? " ×" +
                                  item.quantity
                                : ""}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                    <a href="#booking" className="studio-detail-room-select">
                      Check availability
                    </a>
                  </article>
                ))}
              </div>
            </section>

            <section className="studio-detail-section">
              <div className="studio-detail-section-heading">
                <span>Schedule</span>
                <h2>Opening hours</h2>
              </div>
              <div className="mt-5 max-w-xl divide-y divide-[#ebebeb]">
                {DAYS.map((day, index) => {
                  const row =
                    studio.openingHours.find(
                      (hour) =>
                        hour.dayOfWeek === index,
                    );

                  return (
                    <div
                      key={day}
                      className="flex items-center justify-between py-3 text-sm"
                    >
                      <b>{day}</b>
                      <span className="text-[#717171]">
                        {!row || row.closed
                          ? "Closed"
                          : row.opensAt +
                            " – " +
                            row.closesAt}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section
              id="reviews"
              className="studio-detail-section"
            >
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-black">
                    {average
                      ? "★ " +
                        average.toFixed(2) +
                        " · " +
                        studio.reviews.length +
                        " review" +
                        (studio.reviews.length === 1
                          ? ""
                          : "s")
                      : "Guest reviews"}
                  </h2>
                  <p className="mt-2 text-xs text-[#8a8a8a]">
                    Reviews can only be left after a completed 36 session.
                  </p>
                </div>
              </div>

              {trust.verifiedReviewCount > 0 && (
                <div className="studio-detail-rating-metrics">
                  {[
                    [
                      "Accuracy",
                      trust.averageAccuracy,
                    ],
                    [
                      "Equipment",
                      trust.averageEquipment,
                    ],
                    [
                      "Communication",
                      trust.averageCommunication,
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="studio-detail-rating-metric"
                    >
                      <span className="text-xs text-[#8a8a8a]">
                        {label}
                      </span>
                      <b className="float-right text-sm">
                        {typeof value === "number"
                          ? value.toFixed(1)
                          : "—"}
                      </b>
                    </div>
                  ))}
                </div>
              )}

              <div className="studio-detail-review-grid">
                {studio.reviews.length === 0 ? (
                  <div className="rounded-2xl border border-[#ebebeb] p-5 text-sm text-[#8a8a8a]">
                    No verified reviews yet.
                  </div>
                ) : (
                  studio.reviews.map((review) => (
                    <article
                      key={review.id}
                      className="studio-detail-review-card"
                    >
                      <div className="flex items-center gap-3">
                        <div className="studio-detail-review-avatar">
                          {initials(
                            review.creator.name,
                          ) || "36"}
                        </div>
                        <div>
                          <Link
                            href={"/profile/" + review.creator.id}
                            className="text-sm font-black hover:text-acid"
                          >
                            {review.creator.name}
                          </Link>
                          <div className="mt-0.5 text-[10px] text-acid">
                            {"★".repeat(
                              review.rating,
                            )}
                          </div>
                        </div>
                      </div>

                      {review.comment && (
                        <p className="mt-4 text-sm leading-6 text-[#555555]">
                          {review.comment}
                        </p>
                      )}

                      {review.ownerReply && (
                        <div className="studio-detail-host-reply">
                          <b className="text-[10px] uppercase tracking-[0.12em] text-[#8a8a8a]">
                            Host response
                          </b>
                          <p className="mt-2 text-xs leading-5 text-[#717171]">
                            {review.ownerReply}
                          </p>
                        </div>
                      )}
                    </article>
                  ))
                )}
              </div>
            </section>

            <section
              id="location"
              className="studio-detail-section"
            >
              <div className="studio-detail-section-heading">
                <span>Location</span>
                <h2>Where you’ll be</h2>
              </div>
              <p className="mt-2 text-sm text-[#717171]">
                {studio.neighborhood
                  ? studio.neighborhood + ", "
                  : ""}
                {studio.city}
              </p>
              <p className="mt-2 text-xs text-[#8a8a8a]">
                Approximate area shown before booking. Confirmed creators receive the exact studio address.
              </p>

              {mapPoints.length > 0 ? (
                <div className="mt-5">
                  <StudioMap points={mapPoints} />
                </div>
              ) : (
                <div className="mt-5 rounded-2xl border border-[#ebebeb] p-5 text-sm text-[#8a8a8a]">
                  Approximate map coordinates have not been added yet.
                </div>
              )}
            </section>

            <section id="host" className="studio-detail-host-section">
              <div className="studio-detail-host-layout">
                <div className="flex items-start gap-4">
                  <Link href={"/profile/" + studio.owner.id} className="studio-detail-host-avatar large">
                    {initials(studio.owner.name) || "36"}
                  </Link>
                  <div>
                    <h2 className="text-2xl font-black">
                      Hosted by{" "}
                      <Link
                        href={"/profile/" + studio.owner.id}
                        className="underline decoration-[#bdbdbd] underline-offset-4 hover:text-acid"
                      >
                        {studio.owner.name}
                      </Link>
                    </h2>
                    <p className="mt-1 text-sm text-[#8a8a8a]">
                      Hosting on 36 since {hostYear}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-[#dddddd] px-3 py-1.5 text-[10px] font-black text-[#555555]">
                        ✓ Verified studio
                      </span>
                      <span className="rounded-full border border-[#dddddd] px-3 py-1.5 text-[10px] font-black text-[#555555]">
                        {trust.completedSessions} completed sessions
                      </span>
                    </div>
                  </div>
                </div>

                <div className="studio-detail-host-stats">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="block text-[10px] text-[#8a8a8a]">
                        Response rate
                      </span>
                      <b className="mt-1 block">
                        {trust.responseSampleSize >= 3 &&
                        trust.responseRate != null
                          ? trust.responseRate + "%"
                          : "Building"}
                      </b>
                    </div>
                    <div>
                      <span className="block text-[10px] text-[#8a8a8a]">
                        Response time
                      </span>
                      <b className="mt-1 block">
                        {responseLabel || "Building"}
                      </b>
                    </div>
                  </div>

                  {creatorBooking ? (
                    <Link
                      href={
                        "/messages?booking=" +
                        creatorBooking.id
                      }
                      className="studio-detail-host-message"
                    >
                      Message host
                    </Link>
                  ) : user?.role === "CREATOR" ? (
                    <p className="mt-5 text-xs leading-5 text-[#8a8a8a]">
                      Messaging opens after you reserve a session with this studio.
                    </p>
                  ) : !user ? (
                    <Link
                      href={
                        "/auth/login?next=" +
                        encodeURIComponent(
                          "/studios/" +
                            studio.slug,
                        )
                      }
                      className="studio-detail-host-message"
                    >
                      Log in to book
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>
          </div>

          <aside id="booking" className="order-first self-start lg:order-none lg:sticky lg:top-24">
            <section className="rounded-[1.5rem] border border-[#dddddd] bg-white p-5 shadow-[0_14px_40px_rgba(0,0,0,.09)] sm:p-6">
              <div className="mb-5 flex items-end justify-between gap-3 border-b border-[#ebebeb] pb-4">
                <div>
                  <div className="flex items-baseline gap-1">
                    <b className="text-xl">
                      {minPrice
                        ? minPrice + " MAD"
                        : "Choose a room"}
                    </b>
                    {minPrice && (
                      <span className="text-xs text-[#8a8a8a]">
                        / hour
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-[0.12em] text-[#717171]">
                    36 verified · instant availability check
                  </p>
                </div>

                {average && (
                  <a
                    href="#reviews"
                    className="text-xs font-black underline decoration-[#bdbdbd] underline-offset-4"
                  >
                    ★ {average.toFixed(1)}
                  </a>
                )}
              </div>

              <BookingWidget
                rooms={studio.rooms.map((room) => ({
                  id: room.id,
                  name: room.name,
                  hourlyRateMad: room.hourlyRateMad,
                  minimumHours: room.minimumHours,
                  engineerIncluded: room.engineerIncluded,
                }))}
                addons={studio.addons.map((addon) => ({
                  id: addon.id,
                  roomId: addon.roomId,
                  name: addon.name,
                  description: addon.description,
                  unitPriceMad: addon.unitPriceMad,
                  unitLabel: addon.unitLabel,
                }))}
                userRole={user?.role || null}
                depositPercent={studio.depositPercent}
                freeCancellationHours={studio.freeCancellationHours}
                taxRateBps={studio.taxRateBps}
                timeZone={studioTimeZone(studio)}
                initialDate={safeDate(query.date)}
                initialDurationHours={safeDuration(
                  query.duration,
                )}
                initialStartAt={query.startAt}
                locationLabel={
                  studio.neighborhood
                    ? studio.neighborhood +
                      ", " +
                      studio.city
                    : studio.city
                }
              />

              <div className="mt-5 border-t border-[#ebebeb] pt-4 text-[10px] leading-5 text-[#8a8a8a]">
                <p>
                  Free cancellation up to{" "}
                  {studio.freeCancellationHours}h before the session.
                </p>
                <p className="mt-1">
                  Deposit: {studio.depositPercent}% · Final price is shown before confirmation.
                </p>
              </div>
            </section>
          </aside>
        </div>

        <div className="fixed inset-x-0 bottom-[68px] z-[80] border-t border-[#ebebeb] bg-white/95 px-4 py-3 shadow-[0_-8px_28px_rgba(0,0,0,.08)] backdrop-blur lg:hidden">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div>
              <b className="block text-sm">{minPrice ? minPrice + " MAD" : "Choose a room"}</b>
              <span className="text-[9px] text-[#717171]">{average ? "★ " + average.toFixed(1) + " · " : ""}Verified studio</span>
            </div>
            <a href="#booking" className="rounded-xl bg-acid px-5 py-3 text-xs font-black text-[#111]">
              Reserve
            </a>
          </div>
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
