import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  getStudioTrustMetrics,
  responseTimeLabel,
} from "@/lib/trust";

const EVENT_TYPES = [
  "STUDIO_VIEW",
  "BOOKING_STARTED",
  "BOOKING_CREATED",
  "FAVORITE",
];

function countEvents(
  events: Array<{ eventType: string; studioId: string | null }>,
  eventType: string,
  studioId?: string,
) {
  return events.filter(
    (event) =>
      event.eventType === eventType &&
      (!studioId || event.studioId === studioId),
  ).length;
}

function rate(numerator: number, denominator: number) {
  return denominator > 0
    ? Math.round((numerator / denominator) * 1000) / 10
    : 0;
}

function trend(current: number, previous: number) {
  if (previous === 0) {
    return current > 0 ? "+100%" : "0%";
  }
  const value = Math.round(((current - previous) / previous) * 100);
  return (value > 0 ? "+" : "") + value + "%";
}

export default async function OwnerAnalyticsPage() {
  const user = await requireRole("STUDIO_OWNER");
  const now = new Date();
  const currentStart = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000,
  );
  const previousStart = new Date(
    now.getTime() - 60 * 24 * 60 * 60 * 1000,
  );

  const studios = await db.studio.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      ownerId: true,
    },
  });

  const studioIds = studios.map((studio) => studio.id);

  const [events, currentFavorites, recentBookings, completedBookings, trustRows] =
    await Promise.all([
      studioIds.length
        ? db.marketplaceEvent.findMany({
            where: {
              studioId: { in: studioIds },
              eventType: { in: EVENT_TYPES },
              createdAt: { gte: previousStart },
            },
            select: {
              eventType: true,
              studioId: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      studioIds.length
        ? db.favorite.findMany({
            where: { studioId: { in: studioIds } },
            select: { studioId: true },
          })
        : Promise.resolve([]),
      studioIds.length
        ? db.booking.findMany({
            where: {
              studioId: { in: studioIds },
              createdAt: { gte: previousStart },
            },
            select: {
              studioId: true,
              status: true,
              totalAmountMad: true,
              createdAt: true,
            },
          })
        : Promise.resolve([]),
      studioIds.length
        ? db.booking.findMany({
            where: {
              studioId: { in: studioIds },
              status: "COMPLETED",
              endAt: { gte: previousStart },
            },
            select: {
              studioId: true,
              endAt: true,
            },
          })
        : Promise.resolve([]),
      Promise.all(
        studios.map(async (studio) => ({
          studioId: studio.id,
          trust: await getStudioTrustMetrics(
            studio.id,
            studio.ownerId,
          ),
        })),
      ),
    ]);

  const currentEvents = events.filter(
    (event) => event.createdAt >= currentStart,
  );
  const previousEvents = events.filter(
    (event) =>
      event.createdAt >= previousStart &&
      event.createdAt < currentStart,
  );

  const currentViews = countEvents(currentEvents, "STUDIO_VIEW");
  const previousViews = countEvents(previousEvents, "STUDIO_VIEW");
  const currentStarts = countEvents(currentEvents, "BOOKING_STARTED");
  const previousStarts = countEvents(previousEvents, "BOOKING_STARTED");
  const currentCreated = countEvents(currentEvents, "BOOKING_CREATED");
  const previousCreated = countEvents(previousEvents, "BOOKING_CREATED");
  const currentSaves = countEvents(currentEvents, "FAVORITE");
  const previousSaves = countEvents(previousEvents, "FAVORITE");

  const activeCurrentBookings = recentBookings.filter(
    (booking) =>
      booking.createdAt >= currentStart &&
      ["PENDING_DEPOSIT", "CONFIRMED", "COMPLETED"].includes(
        booking.status,
      ),
  );
  const activeValue = activeCurrentBookings.reduce(
    (sum, booking) => sum + booking.totalAmountMad,
    0,
  );
  const completedCurrent = completedBookings.filter(
    (booking) => booking.endAt >= currentStart,
  ).length;

  const funnel = [
    {
      label: "Profile views",
      value: currentViews,
      previous: previousViews,
    },
    {
      label: "Checkout starts",
      value: currentStarts,
      previous: previousStarts,
    },
    {
      label: "Bookings",
      value: currentCreated,
      previous: previousCreated,
    },
    {
      label: "Save actions",
      value: currentSaves,
      previous: previousSaves,
    },
  ];

  const maxFunnel = Math.max(
    1,
    ...funnel.map((item) => item.value),
  );

  return (
    <main className="min-h-screen bg-white text-[#222]">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-5 py-10 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-acid">
              Owner analytics
            </span>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              Marketplace performance
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#717171]">
              Last 30 days compared with the previous 30 days. Only real
              36 marketplace activity is counted.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/owner/bookings" className="button-dark">
              Bookings
            </Link>
            <Link href="/owner/revenue" className="button-dark">
              Revenue
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {funnel.map((item) => (
            <div key={item.label} className="panel">
              <span className="label">{item.label}</span>
              <div className="mt-2 flex items-end justify-between gap-3">
                <b className="text-3xl">{item.value}</b>
                <span
                  className={
                    "text-xs font-black " +
                    (item.value >= item.previous
                      ? "text-emerald-600"
                      : "text-red-300")
                  }
                >
                  {trend(item.value, item.previous)}
                </span>
              </div>
            </div>
          ))}
          <div className="panel">
            <span className="label">Booking conversion</span>
            <b className="mt-2 block text-3xl">
              {rate(currentCreated, currentViews)}%
            </b>
            <span className="mt-1 block text-xs text-[#8a8a8a]">
              booking events / profile views
            </span>
          </div>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="panel">
            <span className="label">Active booking value</span>
            <b className="mt-2 block text-2xl">{activeValue} MAD</b>
            <span className="mt-1 block text-xs text-[#8a8a8a]">
              bookings created in the last 30 days, excluding cancelled
            </span>
          </div>
          <div className="panel">
            <span className="label">Completed sessions</span>
            <b className="mt-2 block text-2xl">{completedCurrent}</b>
            <span className="mt-1 block text-xs text-[#8a8a8a]">
              sessions completed in the last 30 days
            </span>
          </div>
          <div className="panel">
            <span className="label">Current favorites</span>
            <b className="mt-2 block text-2xl">
              {currentFavorites.length}
            </b>
            <span className="mt-1 block text-xs text-[#8a8a8a]">
              creators currently saving your studios
            </span>
          </div>
        </div>

        <section className="mt-6 rounded-2xl border border-[#ebebeb] bg-white p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <span className="label">30-day funnel</span>
              <h2 className="text-xl font-black">Discovery → booking</h2>
            </div>
            <span className="text-[10px] text-[#a3a3a3]">
              Checkout starts are recorded after a valid server price quote
            </span>
          </div>

          <div className="mt-5 space-y-4">
            {funnel.slice(0, 3).map((item) => (
              <div key={item.label}>
                <div className="mb-1 flex justify-between gap-4 text-xs">
                  <span className="text-[#717171]">{item.label}</span>
                  <b>{item.value}</b>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#f3f3f3]">
                  <div
                    className="h-full rounded-full bg-acid"
                    style={{
                      width:
                        Math.max(
                          3,
                          Math.round((item.value / maxFunnel) * 100),
                        ) + "%",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[#ebebeb] bg-[#f7f7f7] p-4">
              <span className="label">View → checkout</span>
              <b className="text-xl">
                {rate(currentStarts, currentViews)}%
              </b>
            </div>
            <div className="rounded-xl border border-[#ebebeb] bg-[#f7f7f7] p-4">
              <span className="label">Checkout → booking</span>
              <b className="text-xl">
                {rate(currentCreated, currentStarts)}%
              </b>
            </div>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-[#ebebeb] bg-white">
          <div className="border-b border-[#ebebeb] p-5">
            <span className="label">Per studio</span>
            <h2 className="text-xl font-black">
              Conversion & trust signals
            </h2>
          </div>

          {studios.length === 0 ? (
            <div className="p-8 text-sm text-[#8a8a8a]">
              Create a studio to start collecting marketplace analytics.
            </div>
          ) : (
            <div className="divide-y divide-[#ebebeb]">
              {studios.map((studio) => {
                const studioEvents = currentEvents.filter(
                  (event) => event.studioId === studio.id,
                );
                const views = countEvents(
                  studioEvents,
                  "STUDIO_VIEW",
                  studio.id,
                );
                const starts = countEvents(
                  studioEvents,
                  "BOOKING_STARTED",
                  studio.id,
                );
                const created = countEvents(
                  studioEvents,
                  "BOOKING_CREATED",
                  studio.id,
                );
                const saves = currentFavorites.filter(
                  (favorite) => favorite.studioId === studio.id,
                ).length;
                const trust =
                  trustRows.find(
                    (row) => row.studioId === studio.id,
                  )?.trust || null;
                const responseLabel =
                  trust && trust.responseSampleSize >= 3
                    ? responseTimeLabel(trust.typicalResponseMinutes)
                    : null;

                return (
                  <div
                    key={studio.id}
                    className="grid gap-4 p-5 lg:grid-cols-[1.4fr_repeat(5,minmax(90px,.7fr))]"
                  >
                    <div>
                      <Link
                        href={"/studios/" + studio.slug}
                        className="font-black hover:text-acid"
                      >
                        {studio.name}
                      </Link>
                      <span className="mt-1 block text-[10px] uppercase tracking-[0.1em] text-[#a3a3a3]">
                        {studio.status}
                      </span>
                      {trust &&
                        trust.responseSampleSize >= 3 &&
                        trust.responseRate != null && (
                          <span className="mt-2 block text-[10px] text-emerald-600">
                            {trust.responseRate}% response rate
                            {responseLabel ? " · " + responseLabel : ""}
                          </span>
                        )}
                    </div>
                    <div>
                      <span className="label">Views</span>
                      <b>{views}</b>
                    </div>
                    <div>
                      <span className="label">Checkouts</span>
                      <b>{starts}</b>
                    </div>
                    <div>
                      <span className="label">Bookings</span>
                      <b>{created}</b>
                    </div>
                    <div>
                      <span className="label">Conversion</span>
                      <b>{rate(created, views)}%</b>
                    </div>
                    <div>
                      <span className="label">Saved</span>
                      <b>{saves}</b>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
