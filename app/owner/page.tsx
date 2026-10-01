import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { StudioStatusBadge } from "@/components/StudioStatusBadge";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMad } from "@/lib/finance";
import { categoryLabel, studioCompletion } from "@/lib/studio";
import { formatMarketplaceDateTime } from "@/lib/time";

export default async function OwnerDashboardPage() {
  const user = await requireRole("STUDIO_OWNER");
  const now = new Date();
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const studios = await db.studio.findMany({
    where: { ownerId: user.id },
    orderBy: { createdAt: "desc" },
    include: {
      rooms: true,
      photos: true,
      openingHours: true,
      reviews: { select: { rating: true } },
    },
  });

  const studioIds = studios.map((studio) => studio.id);

  const [upcomingCount, recentBookings, recentValue, pendingClaims, eligiblePayout] =
    await Promise.all([
      db.booking.count({
        where: {
          studioId: { in: studioIds },
          startAt: { gte: now },
          status: { in: ["PENDING_DEPOSIT", "CONFIRMED"] },
        },
      }),
      db.booking.findMany({
        where: { studioId: { in: studioIds } },
        orderBy: { createdAt: "desc" },
        take: 6,
        include: { studio: true, room: true, creator: true },
      }),
      db.booking.findMany({
        where: {
          studioId: { in: studioIds },
          createdAt: { gte: last30Days },
          status: { in: ["PENDING_DEPOSIT", "CONFIRMED", "COMPLETED"] },
        },
        select: { totalAmountMad: true, studioNetAmountMad: true },
      }),
      db.candidateStudioClaim.count({
        where: { claimantId: user.id, status: "SUBMITTED" },
      }),
      db.payout.aggregate({
        where: { studioId: { in: studioIds }, status: "ELIGIBLE" },
        _sum: { netAmountMad: true },
      }),
    ]);

  const verifiedStudios = studios.filter((studio) => studio.status === "VERIFIED").length;
  const gross30 = recentValue.reduce((sum, booking) => sum + booking.totalAmountMad, 0);
  const net30 = recentValue.reduce((sum, booking) => sum + booking.studioNetAmountMad, 0);
  const ratings = studios.flatMap((studio) => studio.reviews.map((review) => review.rating));
  const averageRating = ratings.length
    ? ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length
    : null;
  const averageCompletion = studios.length
    ? Math.round(
        studios.reduce((sum, studio) => sum + studioCompletion(studio), 0) /
          studios.length,
      )
    : 0;

  const quickActions = [
    ["List another studio", "Start a new listing from scratch.", "/owner/studios/new", "+"],
    ["My studios", "Edit listings, rooms, photos and verification.", "/owner/studios", "36"],
    ["Bookings", "Manage sessions and payments.", "/owner/bookings", "▣"],
    ["Availability", "Open or block studio time.", "/owner/availability", "◷"],
    ["Revenue", "See studio net, payouts and commission.", "/owner/revenue", "MAD"],
    ["Analytics", "Track views, saves and booking conversion.", "/owner/analytics", "↗"],
  ];

  return (
    <main className="min-h-screen bg-[#f7f7f7] text-[#222]">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-5 py-9 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-acid">
              Owner dashboard
            </span>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              Welcome back, {user.name.split(" ")[0]}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#717171]">
              Business overview: studios, upcoming sessions, revenue and listing
              health in one place.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/owner/studios" className="rounded-full border border-[#d8d8d8] bg-white px-5 py-3 text-xs font-black">
              My studios
            </Link>
            <Link href="/owner/studios/new" className="rounded-full bg-[#222] px-5 py-3 text-xs font-black text-white">
              + List a studio
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <article className="rounded-2xl border border-[#e7e7e7] bg-white p-5">
            <span className="label">Studios</span>
            <b className="mt-2 block text-3xl">{studios.length}</b>
            <span className="mt-1 block text-xs text-[#8a8a8a]">{verifiedStudios} verified</span>
          </article>
          <article className="rounded-2xl border border-[#e7e7e7] bg-white p-5">
            <span className="label">Upcoming</span>
            <b className="mt-2 block text-3xl">{upcomingCount}</b>
            <span className="mt-1 block text-xs text-[#8a8a8a]">future active bookings</span>
          </article>
          <article className="rounded-2xl border border-[#e7e7e7] bg-white p-5">
            <span className="label">30-day studio net</span>
            <b className="mt-2 block text-3xl">{formatMad(net30)}</b>
            <span className="mt-1 block text-xs text-[#8a8a8a]">{formatMad(gross30)} gross</span>
          </article>
          <article className="rounded-2xl border border-[#e7e7e7] bg-white p-5">
            <span className="label">Eligible payout</span>
            <b className="mt-2 block text-3xl">{formatMad(eligiblePayout._sum.netAmountMad || 0)}</b>
            <span className="mt-1 block text-xs text-[#8a8a8a]">ready for payout</span>
          </article>
          <article className="rounded-2xl border border-[#e7e7e7] bg-white p-5">
            <span className="label">Rating</span>
            <b className="mt-2 block text-3xl">{averageRating ? "★ " + averageRating.toFixed(1) : "New"}</b>
            <span className="mt-1 block text-xs text-[#8a8a8a]">{ratings.length} review{ratings.length === 1 ? "" : "s"}</span>
          </article>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
          <section className="overflow-hidden rounded-3xl border border-[#e7e7e7] bg-white">
            <div className="flex items-end justify-between gap-4 border-b border-[#eeeeee] p-5 sm:p-6">
              <div>
                <span className="label">Operations</span>
                <h2 className="text-2xl font-black tracking-[-0.03em]">Recent bookings</h2>
              </div>
              <Link href="/owner/bookings" className="text-xs font-black underline underline-offset-4">View all</Link>
            </div>
            {recentBookings.length === 0 ? (
              <div className="p-10 text-center">
                <b className="text-lg">No bookings yet</b>
                <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#8a8a8a]">
                  Verified rooms will appear here when creators start reserving sessions.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-[#eeeeee]">
                {recentBookings.map((booking) => (
                  <Link key={booking.id} href={"/owner/bookings/" + booking.id} className="grid gap-3 p-5 transition hover:bg-[#fafafa] sm:grid-cols-[1fr_auto]">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <b className="truncate">{booking.studio.name}</b>
                        <span className="rounded-full bg-[#f2f2f2] px-2 py-1 text-[9px] font-black uppercase text-[#717171]">
                          {booking.status.replaceAll("_", " ")}
                        </span>
                      </div>
                      <span className="mt-1 block text-xs text-[#717171]">{booking.room.name} · {booking.creator.name}</span>
                      <span className="mt-1 block text-[10px] text-[#a3a3a3]">{formatMarketplaceDateTime(booking.startAt)}</span>
                    </div>
                    <div className="text-left sm:text-right">
                      <b>{formatMad(booking.totalAmountMad)}</b>
                      <span className="block text-[10px] text-[#8a8a8a]">booking value</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <div className="space-y-6">
            <section className="rounded-3xl border border-[#e7e7e7] bg-white p-5 sm:p-6">
              <span className="label">Listing health</span>
              <div className="mt-2 flex items-end justify-between gap-4">
                <b className="text-3xl">{averageCompletion}%</b>
                <span className="text-xs text-[#8a8a8a]">average completion</span>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[#f1f1f1]">
                <div className="h-full rounded-full bg-acid" style={{ width: averageCompletion + "%" }} />
              </div>
              <div className="mt-5 space-y-3">
                {studios.slice(0, 4).map((studio) => (
                  <Link key={studio.id} href={"/owner/studios/" + studio.id} className="flex items-center justify-between gap-4 rounded-2xl border border-[#eeeeee] p-3 hover:border-[#cccccc]">
                    <div className="min-w-0">
                      <b className="block truncate text-sm">{studio.name}</b>
                      <span className="mt-1 block text-[10px] text-[#8a8a8a]">{categoryLabel(studio.primaryCategory)} · {studio.city}</span>
                    </div>
                    <div className="text-right">
                      <StudioStatusBadge status={studio.status} />
                      <span className="mt-1 block text-[10px] font-black">{studioCompletion(studio)}%</span>
                    </div>
                  </Link>
                ))}
                {studios.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[#d8d8d8] p-5 text-center">
                    <b className="text-sm">No studio listed yet</b>
                    <p className="mt-2 text-xs leading-5 text-[#8a8a8a]">Start your first listing to unlock the owner workspace.</p>
                  </div>
                )}
              </div>
            </section>

            {pendingClaims > 0 && (
              <Link href="/owner/claims" className="block rounded-3xl border border-sky-200 bg-sky-50 p-5">
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-600">Claims</span>
                <b className="mt-2 block text-xl">{pendingClaims} claim{pendingClaims === 1 ? "" : "s"} pending</b>
                <span className="mt-1 block text-xs text-[#717171]">Open claim center →</span>
              </Link>
            )}
          </div>
        </div>

        <section className="mt-6">
          <span className="label">Workspace</span>
          <h2 className="text-2xl font-black tracking-[-0.03em]">Manage your business</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {quickActions.map(([title, text, href, icon]) => (
              <Link key={href} href={href} className="group rounded-2xl border border-[#e7e7e7] bg-white p-5 transition hover:-translate-y-0.5 hover:border-[#cfcfcf] hover:shadow-[0_10px_30px_rgba(0,0,0,.06)]">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#222] text-xs font-black text-white">{icon}</span>
                <b className="mt-4 block text-lg">{title}</b>
                <p className="mt-1 text-sm leading-6 text-[#8a8a8a]">{text}</p>
                <span className="mt-4 block text-xs font-black group-hover:text-acid">Open →</span>
              </Link>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
