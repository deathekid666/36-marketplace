import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { releaseBookingHoldAction } from "@/app/creator/actions";
import { requireCreatorAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/commerce";
import { offlinePaymentLabel } from "@/lib/offline-payment";
import {
  formatMarketplaceDateTime,
  studioTimeZone,
} from "@/lib/time";
import { expireStaleBookingHolds } from "@/lib/booking-lifecycle";

type View = "upcoming" | "past" | "cancelled" | "all";

function parseView(value: string | undefined): View {
  return ["upcoming", "past", "cancelled", "all"].includes(
    String(value || ""),
  )
    ? (value as View)
    : "upcoming";
}

function effectiveStatus(booking: {
  status: string;
  expiresAt: Date | null;
}) {
  if (
    booking.status === "PENDING_DEPOSIT" &&
    booking.expiresAt &&
    booking.expiresAt <= new Date()
  ) {
    return "EXPIRED";
  }
  return booking.status;
}

function reference(id: string) {
  return "36-" + id.replaceAll("-", "").slice(0, 8).toUpperCase();
}

export default async function CreatorBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    booking?: string;
    from?: string;
    released?: string;
    view?: string;
  }>;
}) {
  const user = await requireCreatorAccess();
  const query = await searchParams;
  const view = parseView(query.view);
  const now = new Date();

  await expireStaleBookingHolds({
    creatorId: user.id,
    limit: 100,
  });

  const bookings = await db.booking.findMany({
    where: { creatorId: user.id },
    orderBy: { startAt: "asc" },
    include: {
      studio: {
        include: {
          photos: {
            orderBy: { sortOrder: "asc" },
            take: 1,
          },
        },
      },
      room: true,
      payments: { orderBy: { createdAt: "desc" } },
    },
  });

  const normalized = bookings.map((booking) => ({
    ...booking,
    effectiveStatus: effectiveStatus(booking),
  }));

  const upcoming = normalized.filter(
    (booking) =>
      booking.startAt >= now &&
      ["PENDING_DEPOSIT", "CONFIRMED"].includes(booking.effectiveStatus),
  );
  const cancelled = normalized.filter((booking) =>
    ["CANCELLED", "EXPIRED"].includes(booking.effectiveStatus),
  );
  const past = normalized.filter(
    (booking) =>
      booking.effectiveStatus === "COMPLETED" ||
      (booking.startAt < now &&
        !["CANCELLED", "EXPIRED"].includes(booking.effectiveStatus)),
  );

  const visible =
    view === "past"
      ? [...past].reverse()
      : view === "cancelled"
        ? [...cancelled].reverse()
        : view === "all"
          ? [...normalized].sort(
              (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
            )
          : upcoming;

  const nextSession = upcoming[0] || null;
  const unpaidOffline = upcoming.filter((booking) => {
    const offline = booking.payments.find((payment) =>
      offlinePaymentLabel(payment.provider),
    );
    return offline && booking.paymentStatus !== "PAID";
  }).length;

  const tabs: Array<{ value: View; label: string; count: number }> = [
    { value: "upcoming", label: "Upcoming", count: upcoming.length },
    { value: "past", label: "Past", count: past.length },
    { value: "cancelled", label: "Cancelled", count: cancelled.length },
    { value: "all", label: "All", count: normalized.length },
  ];

  return (
    <main className="min-h-screen bg-white text-[#222]">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-5 py-10 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-acid">
              Creator sessions
            </span>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              Your sessions
            </h1>
            <p className="mt-3 text-sm text-[#717171]">
              Upcoming studio time, past sessions, payment status and booking
              details.
            </p>
          </div>
          <Link
            href="/studios"
            className="rounded-full bg-acid px-5 py-3 text-sm font-black text-white"
          >
            Find another studio
          </Link>
        </div>

        {query.booking && (
          <div className="mt-6 rounded-xl border border-acid/30 bg-acid/[0.04] p-4 text-sm text-acid">
            Session reserved successfully.
          </div>
        )}
        {query.released && (
          <div className="mt-6 rounded-xl border border-[#dddddd] bg-white p-4 text-sm text-[#333333]">
            Booking hold released. The room is available again.
          </div>
        )}

        <div className="mt-8 grid gap-3 sm:grid-cols-3">
          <div className="panel">
            <span className="label">Upcoming</span>
            <b className="mt-2 block text-3xl">{upcoming.length}</b>
            <span className="mt-1 block text-xs text-[#8a8a8a]">
              confirmed or active holds
            </span>
          </div>
          <div className="panel">
            <span className="label">Next session</span>
            {nextSession ? (
              <>
                <b className="mt-2 block truncate text-lg">
                  {nextSession.studio.name}
                </b>
                <span className="mt-1 block text-xs text-[#8a8a8a]">
                  {formatMarketplaceDateTime(
                    nextSession.startAt,
                    studioTimeZone(nextSession.studio),
                  )}
                </span>
              </>
            ) : (
              <b className="mt-2 block text-lg text-[#a3a3a3]">Nothing booked</b>
            )}
          </div>
          <div className="panel">
            <span className="label">Direct payments</span>
            <b className="mt-2 block text-3xl">{unpaidOffline}</b>
            <span className="mt-1 block text-xs text-[#8a8a8a]">
              still waiting for studio receipt confirmation
            </span>
          </div>
        </div>

        <nav className="mt-8 flex gap-2 overflow-x-auto pb-2">
          {tabs.map((tab) => (
            <Link
              key={tab.value}
              href={
                tab.value === "upcoming"
                  ? "/creator/bookings"
                  : "/creator/bookings?view=" + tab.value
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

        <div className="mt-5 space-y-4">
          {visible.length === 0 ? (
            <div className="panel py-14 text-center">
              <h2 className="font-black">No {view} sessions</h2>
              <p className="mt-2 text-sm text-[#8a8a8a]">
                Book a verified studio and it will appear here.
              </p>
            </div>
          ) : (
            visible.map((booking) => {
              const pending = booking.effectiveStatus === "PENDING_DEPOSIT";
              const deposit = booking.payments.find(
                (payment) => payment.kind === "DEPOSIT",
              );
              const offlineMethod = offlinePaymentLabel(
                booking.payments.find((payment) =>
                  offlinePaymentLabel(payment.provider),
                )?.provider,
              );
              const cover = booking.studio.photos[0]?.url || null;
              const location = [
                booking.studio.neighborhood,
                booking.studio.city,
              ]
                .filter(Boolean)
                .join(" · ");

              return (
                <article
                  key={booking.id}
                  className={
                    "overflow-hidden rounded-3xl border bg-white " +
                    (booking.id === query.booking
                      ? "border-acid/40"
                      : "border-[#ebebeb]")
                  }
                >
                  <div className="grid md:grid-cols-[220px_1fr]">
                    <div className="relative min-h-44 bg-[#f3f3f3]">
                      {cover ? (
                        <img
                          src={cover}
                          alt={booking.studio.name}
                          className="absolute inset-0 h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="absolute inset-0 grid place-items-center text-4xl font-black text-[#b8b8b8]">
                          36
                        </div>
                      )}
                      <span className="absolute left-3 top-3 rounded-full bg-black/75 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.1em] text-acid backdrop-blur">
                        {booking.effectiveStatus.replaceAll("_", " ")}
                      </span>
                    </div>

                    <div className="p-5 sm:p-6">
                      <div className="flex flex-wrap items-start justify-between gap-5">
                        <div className="min-w-0">
                          <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a8a8a]">
                            {reference(booking.id)}
                          </span>
                          <h2 className="mt-2 text-2xl font-black">
                            {booking.studio.name}
                          </h2>
                          <p className="mt-1 text-sm text-[#717171]">
                            {booking.room.name} ·{" "}
                            {formatMarketplaceDateTime(
                              booking.startAt,
                              studioTimeZone(booking.studio),
                            )} →{" "}
                            {formatMarketplaceDateTime(
                              booking.endAt,
                              studioTimeZone(booking.studio),
                            )}
                          </p>
                          {location && (
                            <p className="mt-2 text-xs text-[#8a8a8a]">
                              ⌖ {location}
                            </p>
                          )}
                        </div>

                        <div className="text-right">
                          <b className="text-xl">
                            {formatMoney(booking.totalAmountMad, booking.currency)}
                          </b>
                          <span className="block text-[10px] uppercase tracking-[0.08em] text-[#8a8a8a]">
                            {booking.paymentStatus.replaceAll("_", " ")}
                          </span>
                        </div>
                      </div>

                      <div className="mt-5 flex flex-wrap gap-2">
                        {offlineMethod && (
                          <span
                            className={
                              "rounded-full border px-3 py-1.5 text-[10px] font-black " +
                              (booking.paymentStatus === "PAID"
                                ? "border-emerald-900/40 text-emerald-600"
                                : "border-amber-900/40 text-amber-600")
                            }
                          >
                            {offlineMethod} ·{" "}
                            {booking.paymentStatus === "PAID"
                              ? "received"
                              : "pay studio directly"}
                          </span>
                        )}
                        {!offlineMethod && deposit && (
                          <span className="rounded-full border border-[#dddddd] px-3 py-1.5 text-[10px] font-black text-[#717171]">
                            Deposit {deposit.status}
                          </span>
                        )}
                      </div>

                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <Link
                          href={"/creator/bookings/" + booking.id}
                          className="rounded-xl bg-acid px-4 py-2.5 text-xs font-black text-white"
                        >
                          Open session
                        </Link>
                        <Link
                          href={"/studios/" + booking.studio.slug}
                          className="button-dark"
                        >
                          Studio profile
                        </Link>
                        {!["CANCELLED", "EXPIRED"].includes(
                          booking.effectiveStatus,
                        ) && (
                          <a
                            href={"/api/bookings/" + booking.id + "/calendar"}
                            className="button-dark"
                          >
                            Add to calendar
                          </a>
                        )}
                        {pending && (
                          <form action={releaseBookingHoldAction}>
                            <input
                              type="hidden"
                              name="bookingId"
                              value={booking.id}
                            />
                            <button className="text-xs font-bold text-[#8a8a8a] hover:text-red-300">
                              Release hold
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}
