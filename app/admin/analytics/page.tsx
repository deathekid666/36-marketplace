import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { discoveryStaleCutoff } from "@/lib/discovery/freshness";
import { discoverySnapshotMetrics } from "@/lib/discovery/metrics";
import { discoveryRolloutWhere } from "@/lib/discovery/rollout";
import { formatMad } from "@/lib/finance";

function countMap<T extends { [key: string]: unknown }>(
  rows: T[],
  key: keyof T,
  count: (row: T) => number,
) {
  return new Map(rows.map((row) => [String(row[key]), count(row)]));
}

export default async function AdminAnalyticsPage() {
  const user = await requireRole("ADMIN");
  const since = new Date(Date.now() - 30 * 86400000);
  const staleCutoff = discoveryStaleCutoff();

  const [
    users,
    studios,
    verified,
    bookings,
    requests,
    offers,
    events,
    payouts,
    candidateStatusRows,
    claimStatusRows,
    providerRows,
    discoveryEvents,
    publicDiscoveryReady,
  ] = await Promise.all([
    db.user.count(),
    db.studio.count(),
    db.studio.count({ where: { status: "VERIFIED" } }),
    db.booking.findMany({
      where: { createdAt: { gte: since } },
      select: {
        status: true,
        totalAmountMad: true,
        commissionAmountMad: true,
        createdAt: true,
      },
    }),
    db.studioRequest.count({ where: { createdAt: { gte: since } } }),
    db.requestOffer.count({ where: { createdAt: { gte: since } } }),
    db.marketplaceEvent.groupBy({
      by: ["eventType"],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    }),
    db.payout.aggregate({
      _sum: { netAmountMad: true, commissionAmountMad: true },
      where: { createdAt: { gte: since } },
    }),
    db.candidateStudio.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    db.candidateStudioClaim.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    db.candidateStudioSource.groupBy({
      by: ["provider"],
      _count: { _all: true },
      orderBy: { _count: { provider: "desc" } },
    }),
    db.marketplaceEvent.groupBy({
      by: ["eventType"],
      where: {
        createdAt: { gte: since },
        eventType: { startsWith: "DISCOVERY_" },
      },
      _count: { _all: true },
    }),
    db.candidateStudio.count({
      where: {
        AND: [
          discoveryRolloutWhere("PUBLIC_DISCOVERY"),
          { status: "APPROVED" },
          { lastCheckedAt: { gte: staleCutoff } },
        ],
      },
    }),
  ]);

  const gmv = bookings
    .filter((booking) => ["CONFIRMED", "COMPLETED"].includes(booking.status))
    .reduce((sum, booking) => sum + booking.totalAmountMad, 0);
  const commission = bookings
    .filter((booking) => ["CONFIRMED", "COMPLETED"].includes(booking.status))
    .reduce((sum, booking) => sum + booking.commissionAmountMad, 0);
  const cancelled = bookings.filter((booking) => booking.status === "CANCELLED").length;
  const confirmed = bookings.filter((booking) =>
    ["CONFIRMED", "COMPLETED"].includes(booking.status),
  ).length;

  const candidateCounts = countMap(
    candidateStatusRows,
    "status",
    (row) => row._count._all,
  );
  const claimCounts = countMap(
    claimStatusRows,
    "status",
    (row) => row._count._all,
  );

  const candidates = candidateStatusRows.reduce(
    (sum, row) => sum + row._count._all,
    0,
  );
  const approvedCandidates = candidateCounts.get("APPROVED") || 0;
  const convertedCandidates = candidateCounts.get("CONVERTED") || 0;
  const submittedClaims = claimCounts.get("SUBMITTED") || 0;
  const verifiedClaims = claimCounts.get("VERIFIED") || 0;
  const rejectedClaims = claimCounts.get("REJECTED") || 0;
  const withdrawnClaims = claimCounts.get("WITHDRAWN") || 0;

  const discoveryRatios = discoverySnapshotMetrics({
    candidates,
    approved: approvedCandidates,
    converted: convertedCandidates,
    claimsVerified: verifiedClaims,
    claimsRejected: rejectedClaims,
  });

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-5 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/admin" className="text-xs font-bold text-zinc-500">
              ← Admin
            </Link>
            <span className="mt-6 block text-xs font-bold uppercase tracking-[0.2em] text-acid">
              Last 30 days
            </span>
            <h1 className="mt-2 text-4xl font-black">Marketplace analytics</h1>
          </div>
          <div className="flex gap-2">
            <Link
              href="/admin/discovery"
              className="rounded-full border border-sky-900/60 px-4 py-2 text-xs font-bold text-sky-300"
            >
              Discovery
            </Link>
            <Link
              href="/admin/payouts"
              className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-bold"
            >
              Payouts
            </Link>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Users", users],
            ["Verified studios", verified],
            ["Bookings created", bookings.length],
            ["Confirmed/completed", confirmed],
            ["GMV", formatMad(gmv)],
            ["36 commission", formatMad(commission)],
            ["36 Requests", requests],
            ["Offers sent", offers],
          ].map(([label, value]) => (
            <div className="panel" key={String(label)}>
              <span className="label">{label}</span>
              <b className="mt-3 block text-2xl">{value}</b>
            </div>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="panel">
            <h2 className="text-xl font-black">Funnel events</h2>
            <div className="mt-5 space-y-3">
              {events.length === 0 ? (
                <p className="text-sm text-zinc-600">No tracked events yet.</p>
              ) : (
                events
                  .sort((a, b) => b._count._all - a._count._all)
                  .map((event) => (
                    <div
                      className="flex justify-between border-b border-zinc-900 pb-3"
                      key={event.eventType}
                    >
                      <span className="text-sm text-zinc-400">
                        {event.eventType.replaceAll("_", " ")}
                      </span>
                      <b>{event._count._all}</b>
                    </div>
                  ))
              )}
            </div>
          </section>

          <section className="panel">
            <h2 className="text-xl font-black">Marketplace health</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-500">All studios</dt>
                <dd className="font-bold">{studios}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Verification rate</dt>
                <dd className="font-bold">
                  {studios ? Math.round((verified / studios) * 100) : 0}%
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Cancellation rate</dt>
                <dd className="font-bold">
                  {bookings.length
                    ? Math.round((cancelled / bookings.length) * 100)
                    : 0}
                  %
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-500">Net studio value tracked</dt>
                <dd className="font-bold text-acid">
                  {formatMad(payouts._sum.netAmountMad || 0)}
                </dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="mt-10">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">
                Discovery pipeline
              </span>
              <h2 className="mt-2 text-3xl font-black">Supply acquisition metrics</h2>
              <p className="mt-2 text-sm text-zinc-600">
                Current pipeline counts plus discovery events from the last 30 days.
              </p>
            </div>
            <span className="text-xs text-zinc-700">
              Snapshot ratios are descriptive, not forecasts.
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Candidates", candidates],
              ["Public-ready approved", publicDiscoveryReady],
              ["Approved", approvedCandidates],
              ["Converted to onboarding", convertedCandidates],
              ["Pending claims", submittedClaims],
              ["Verified claims", verifiedClaims],
              ["Rejected claims", rejectedClaims],
              ["Withdrawn claims", withdrawnClaims],
            ].map(([label, value]) => (
              <div className="rounded-2xl border border-zinc-900 bg-zinc-950/60 p-5" key={String(label)}>
                <span className="label">{label}</span>
                <b className="mt-3 block text-2xl">{value}</b>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <section className="panel">
              <h3 className="text-lg font-black">Snapshot funnel ratios</h3>
              <dl className="mt-5 space-y-4 text-sm">
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-zinc-500">Approved or converted / candidates</dt>
                  <dd className="font-black text-sky-300">
                    {discoveryRatios.candidateApprovalRatio}%
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-zinc-500">Verified / decided claims</dt>
                  <dd className="font-black text-sky-300">
                    {discoveryRatios.claimVerificationRatio}%
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-4">
                  <dt className="text-zinc-500">Onboarding / verified claims</dt>
                  <dd className="font-black text-sky-300">
                    {discoveryRatios.verifiedClaimToOnboardingRatio}%
                  </dd>
                </div>
              </dl>
            </section>

            <section className="panel">
              <h3 className="text-lg font-black">Provider evidence</h3>
              <div className="mt-5 space-y-3">
                {providerRows.length === 0 ? (
                  <p className="text-sm text-zinc-600">No provider sources yet.</p>
                ) : (
                  providerRows.map((row) => (
                    <div
                      key={row.provider}
                      className="flex justify-between border-b border-zinc-900 pb-3"
                    >
                      <span className="text-sm text-zinc-400">{row.provider}</span>
                      <b>{row._count._all}</b>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="panel">
              <h3 className="text-lg font-black">Discovery events · 30 days</h3>
              <div className="mt-5 space-y-3">
                {discoveryEvents.length === 0 ? (
                  <p className="text-sm text-zinc-600">
                    No discovery funnel events recorded yet.
                  </p>
                ) : (
                  discoveryEvents
                    .sort((a, b) => b._count._all - a._count._all)
                    .map((event) => (
                      <div
                        key={event.eventType}
                        className="flex justify-between border-b border-zinc-900 pb-3"
                      >
                        <span className="text-xs text-zinc-500">
                          {event.eventType.replace("DISCOVERY_", "").replaceAll("_", " ")}
                        </span>
                        <b>{event._count._all}</b>
                      </div>
                    ))
                )}
              </div>
            </section>
          </div>
        </section>
      </section>
    </main>
  );
}
