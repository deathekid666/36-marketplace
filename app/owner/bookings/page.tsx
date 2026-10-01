import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  offlinePaymentLabel,
} from "@/lib/offline-payment";
import {
  formatMarketplaceDateTime,
  localDateKey,
} from "@/lib/time";
import { expireStaleBookingHolds } from "@/lib/booking-lifecycle";

type View = "today" | "upcoming" | "completed" | "cancelled" | "all";

function parseView(value: string | undefined): View {
  return ["today", "upcoming", "completed", "cancelled", "all"].includes(
    String(value || ""),
  )
    ? (value as View)
    : "upcoming";
}

function groupByDate<T extends { startAt: Date }>(rows: T[]) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = localDateKey(row.startAt);
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  return groups;
}

function shortDay(value: Date) {
  return new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Casablanca",
    weekday: "short",
  }).format(value);
}

function dayNumber(value: Date) {
  return new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Casablanca",
    day: "numeric",
  }).format(value);
}

export default async function OwnerBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireRole("STUDIO_OWNER");
  const query = await searchParams;
  const view = parseView(query.view);
  const now = new Date();
  const todayKey = localDateKey(now);

  await expireStaleBookingHolds({
    ownerId: user.id,
    limit: 150,
  });

  const bookings = await db.booking.findMany({
    where: {
      studio: { ownerId: user.id },
      startAt: {
        gte: new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000),
      },
    },
    orderBy: { startAt: "asc" },
    include: {
      creator: true,
      studio: true,
      room: true,
      payments: { orderBy: { createdAt: "desc" } },
    },
  });

  const today = bookings.filter(
    (booking) =>
      localDateKey(booking.startAt) === todayKey &&
      !["CANCELLED", "EXPIRED"].includes(booking.status),
  );
  const upcoming = bookings.filter(
    (booking) =>
      booking.startAt >= now &&
      ["CONFIRMED", "PENDING_DEPOSIT"].includes(booking.status),
  );
  const completed = bookings.filter(
    (booking) => booking.status === "COMPLETED",
  );
  const cancelled = bookings.filter((booking) =>
    ["CANCELLED", "EXPIRED"].includes(booking.status),
  );

  const visible =
    view === "today"
      ? today
      : view === "completed"
        ? [...completed].reverse()
        : view === "cancelled"
          ? [...cancelled].reverse()
          : view === "all"
            ? [...bookings].reverse()
            : upcoming;

  const grouped = groupByDate(visible);
  const offlinePending = bookings.filter((booking) =>
    booking.payments.some(
      (payment) =>
        payment.status === "PENDING" &&
        Boolean(offlinePaymentLabel(payment.provider)),
    ),
  );
  const collectedMad = bookings
    .filter((booking) => booking.paymentStatus === "PAID")
    .reduce((sum, booking) => sum + booking.totalAmountMad, 0);
  const pendingCollectionMad = offlinePending.reduce(
    (sum, booking) => sum + booking.totalAmountMad,
    0,
  );

  const days = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(now.getTime() + index * 24 * 60 * 60 * 1000);
    const key = localDateKey(date);
    const count = upcoming.filter(
      (booking) => localDateKey(booking.startAt) === key,
    ).length;
    return { date, key, count };
  });

  const tabs: Array<{ value: View; label: string; count: number }> = [
    { value: "today", label: "Today", count: today.length },
    { value: "upcoming", label: "Upcoming", count: upcoming.length },
    { value: "completed", label: "Completed", count: completed.length },
    { value: "cancelled", label: "Cancelled", count: cancelled.length },
    { value: "all", label: "All", count: bookings.length },
  ];

  return (
    <main className="min-h-screen bg-white text-[#222]">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-5 py-10 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-acid">
              Owner operations
            </span>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              Booking dashboard
            </h1>
            <p className="mt-3 text-sm text-[#717171]">
              Sessions, creator details and offline payment collection across
              every room.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/owner/studios"
              className="rounded-full border border-[#cfcfcf] px-5 py-3 text-xs font-black"
            >
              Studios
            </Link>
            <Link
              href="/owner/availability"
              className="rounded-full border border-acid/30 px-5 py-3 text-xs font-black text-acid"
            >
              Availability
            </Link>
            <Link
              href="/owner/requests"
              className="rounded-full border border-[#cfcfcf] px-5 py-3 text-xs font-black"
            >
              36 Requests
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="panel">
            <span className="label">Today</span>
            <b className="mt-2 block text-3xl">{today.length}</b>
            <span className="mt-1 block text-xs text-[#8a8a8a]">
              scheduled session{today.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="panel">
            <span className="label">Upcoming</span>
            <b className="mt-2 block text-3xl">{upcoming.length}</b>
            <span className="mt-1 block text-xs text-[#8a8a8a]">
              active future bookings
            </span>
          </div>
          <div className="panel">
            <span className="label">Collected</span>
            <b className="mt-2 block text-3xl">{collectedMad} MAD</b>
            <span className="mt-1 block text-xs text-[#8a8a8a]">
              marked paid in this 180-day window
            </span>
          </div>
          <div className="panel">
            <span className="label">To collect</span>
            <b className="mt-2 block text-3xl text-emerald-600">
              {pendingCollectionMad} MAD
            </b>
            <span className="mt-1 block text-xs text-[#8a8a8a]">
              {offlinePending.length} offline booking
              {offlinePending.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

        <section className="mt-6 rounded-2xl border border-[#ebebeb] bg-white p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <span className="label">Next 14 days</span>
              <b className="text-sm">Session calendar</b>
            </div>
            <span className="text-[10px] text-[#a3a3a3]">
              Casablanca time
            </span>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-2 lg:grid-cols-14">
            {days.map((day) => (
              <div
                key={day.key}
                className={
                  "rounded-xl border p-2 text-center " +
                  (day.count
                    ? "border-acid/30 bg-acid/[0.035]"
                    : "border-[#ebebeb] bg-[#f7f7f7]")
                }
              >
                <span className="block text-[9px] font-black uppercase text-[#8a8a8a]">
                  {shortDay(day.date)}
                </span>
                <b className="mt-1 block text-sm">{dayNumber(day.date)}</b>
                <span
                  className={
                    "mt-1 block text-[9px] font-black " +
                    (day.count ? "text-acid" : "text-[#b8b8b8]")
                  }
                >
                  {day.count || "—"}
                </span>
              </div>
            ))}
          </div>
        </section>

        <nav className="mt-8 flex gap-2 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <Link
              key={tab.value}
              href={
                tab.value === "upcoming"
                  ? "/owner/bookings"
                  : "/owner/bookings?view=" + tab.value
              }
              className={
                "shrink-0 rounded-full border px-4 py-2 text-xs font-black " +
                (view === tab.value
                  ? "border-acid/40 bg-acid/[0.06] text-acid"
                  : "border-[#dddddd] text-[#717171] hover:text-[#222222]")
              }
            >
              {tab.label} · {tab.count}
            </Link>
          ))}
        </nav>

        <div className="mt-5 space-y-7">
          {visible.length === 0 ? (
            <div className="panel py-12 text-center">
              <h2 className="font-black">No {view} bookings</h2>
              <p className="mt-2 text-sm text-[#8a8a8a]">
                Bookings will appear here as creators reserve your verified
                rooms.
              </p>
            </div>
          ) : (
            Array.from(grouped.entries()).map(([date, dayBookings]) => (
              <section key={date}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase tracking-[0.16em] text-[#717171]">
                    {date}
                  </h2>
                  <span className="text-[10px] text-[#a3a3a3]">
                    {dayBookings.length} session
                    {dayBookings.length === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="space-y-3">
                  {dayBookings.map((booking) => {
                    const offlineMethod = offlinePaymentLabel(
                      booking.payments.find((payment) =>
                        offlinePaymentLabel(payment.provider),
                      )?.provider,
                    );
                    const paymentPending =
                      offlineMethod &&
                      booking.paymentStatus !== "PAID";

                    return (
                      <article
                        key={booking.id}
                        className="rounded-2xl border border-[#ebebeb] bg-white p-5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-5">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-acid">
                                {booking.status.replaceAll("_", " ")}
                              </span>
                              {offlineMethod && (
                                <span
                                  className={
                                    "rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] " +
                                    (paymentPending
                                      ? "border-amber-900/40 text-amber-600"
                                      : "border-emerald-900/40 text-emerald-600")
                                  }
                                >
                                  {paymentPending
                                    ? "Collect payment"
                                    : "Paid"}{" "}
                                  · {offlineMethod}
                                </span>
                              )}
                            </div>
                            <h3 className="mt-2 text-xl font-black">
                              {booking.room.name}
                            </h3>
                            <p className="mt-1 text-xs text-[#717171]">
                              {booking.studio.name} ·{" "}
                              {formatMarketplaceDateTime(booking.startAt)} →{" "}
                              {formatMarketplaceDateTime(booking.endAt)}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[#8a8a8a]">
                              <span>
                                Creator:{" "}
                                <b className="text-[#333333]">
                                  {booking.creator.name}
                                </b>
                              </span>
                              <span>{booking.creator.email}</span>
                              {booking.creator.phone && (
                                <span>{booking.creator.phone}</span>
                              )}
                            </div>
                          </div>

                          <div className="text-right">
                            <b className="text-xl">
                              {booking.totalAmountMad} MAD
                            </b>
                            <span className="block text-[10px] uppercase tracking-[0.08em] text-[#8a8a8a]">
                              {booking.paymentStatus.replaceAll("_", " ")}
                            </span>
                            <Link
                              href={"/owner/bookings/" + booking.id}
                              className="mt-4 inline-flex rounded-xl border border-[#dddddd] px-4 py-2 text-xs font-black text-acid hover:border-acid/40"
                            >
                              Manage booking →
                            </Link>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
