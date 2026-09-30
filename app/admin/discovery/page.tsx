import { CandidateStudioStatus, Prisma } from "@prisma/client";
import Link from "next/link";

import {
  importOpenStreetMapAction,
  importOvertureAction,
} from "@/app/admin/discovery/import-actions";
import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeSearchText } from "@/lib/discovery/normalization";
import { directoryStudioIdentityWhere } from "@/lib/discovery/public-eligibility";
import {
  discoveryFreshness,
  discoveryFreshnessClass,
  discoveryFreshnessLabel,
  discoveryStaleCutoff,
} from "@/lib/discovery/freshness";
import { getOpenStreetMapSnapshotInfo } from "@/lib/discovery/providers/openstreetmap-snapshot";
import { getOvertureSnapshotInfo } from "@/lib/discovery/providers/overture";
import { DISCOVERY_PROVIDERS } from "@/lib/discovery/providers/registry";
import { DISCOVERY_ROLLOUT_SCOPES } from "@/lib/discovery/rollout";

export const metadata = { title: "Discovery · 36 Admin" };

const STATUS_LABELS: Record<CandidateStudioStatus, string> = {
  DISCOVERED: "Discovered",
  ENRICHED: "Enriched",
  REVIEW_REQUIRED: "Needs review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
  CONVERTED: "Converted",
};

const STATUS_CLASS: Record<CandidateStudioStatus, string> = {
  DISCOVERED: "border-zinc-700 text-zinc-300",
  ENRICHED: "border-sky-900/70 text-sky-300",
  REVIEW_REQUIRED: "border-amber-800/70 text-amber-300",
  APPROVED: "border-acid/30 text-acid",
  REJECTED: "border-red-900/70 text-red-300",
  ARCHIVED: "border-zinc-800 text-zinc-500",
  CONVERTED: "border-emerald-900/70 text-emerald-300",
};

function validStatus(value: string | undefined): CandidateStudioStatus | null {
  if (!value || value === "ALL") return null;
  return Object.values(CandidateStudioStatus).includes(value as CandidateStudioStatus)
    ? (value as CandidateStudioStatus)
    : null;
}

function dateLabel(value: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

export default async function AdminDiscoveryPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    q?: string;
    country?: string;
    page?: string;
    imported?: string;
    enriched?: string;
    review?: string;
    matched?: string;
    refreshed?: string;
    skipped?: string;
    preset?: string;
    importError?: string;
    provider?: string;
    freshness?: string;
  }>;
}) {
  const user = await requireRole("ADMIN");
  const query = await searchParams;

  const status = validStatus(query.status);
  const freshnessFilter = query.freshness === "STALE" ? "STALE" : "";
  const rawSearch = String(query.q || "").trim().slice(0, 120);
  const normalizedSearch = normalizeSearchText(rawSearch);
  const country = /^[a-zA-Z]{2}$/.test(String(query.country || "").trim())
    ? String(query.country).trim().toUpperCase()
    : "";
  const page = Math.max(1, Math.min(1000, Number.parseInt(String(query.page || "1"), 10) || 1));
  const pageSize = 40;
  const overtureSnapshot = getOvertureSnapshotInfo();
  const osmSnapshot = getOpenStreetMapSnapshotInfo();
  const staleCutoff = discoveryStaleCutoff();

  const filters: Prisma.CandidateStudioWhereInput[] = [];
  if (status) filters.push({ status });
  if (freshnessFilter === "STALE") {
    filters.push(
      { status: { not: "CONVERTED" } },
      {
        OR: [
          { lastCheckedAt: null },
          { lastCheckedAt: { lt: staleCutoff } },
        ],
      },
    );
  }
  if (country) filters.push({ countryCode: country });
  if (rawSearch) {
    filters.push({
      OR: [
        { name: { contains: rawSearch, mode: "insensitive" } },
        ...(normalizedSearch
          ? [{ normalizedName: { contains: normalizedSearch, mode: "insensitive" as const } }]
          : []),
        { city: { contains: rawSearch, mode: "insensitive" } },
        { country: { contains: rawSearch, mode: "insensitive" } },
        { website: { contains: rawSearch, mode: "insensitive" } },
        { instagram: { contains: rawSearch, mode: "insensitive" } },
        { phone: { contains: rawSearch } },
      ],
    });
  }

  const where: Prisma.CandidateStudioWhereInput =
    filters.length > 0 ? { AND: filters } : {};

  const [
    candidates,
    filteredCount,
    total,
    discovered,
    enriched,
    review,
    approved,
    converted,
    withPhone,
    withWebsite,
    withEmail,
    staleCount,
    countryRows,
    providerRows,
    duplicateMerges,
    contactReports30d,
    verifiedClaims,
    hiddenWeakIdentity,
  ] = await Promise.all([
      db.candidateStudio.findMany({
        where,
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: { sources: true, transitions: true },
          },
          sources: {
            where: { active: true },
            orderBy: { collectedAt: "desc" },
            take: 2,
            select: { id: true, provider: true, sourceUrl: true },
          },
          convertedStudio: {
            select: { id: true, name: true, slug: true, status: true },
          },
        },
      }),
      db.candidateStudio.count({ where }),
      db.candidateStudio.count(),
      db.candidateStudio.count({ where: { status: "DISCOVERED" } }),
      db.candidateStudio.count({ where: { status: "ENRICHED" } }),
      db.candidateStudio.count({ where: { status: "REVIEW_REQUIRED" } }),
      db.candidateStudio.count({ where: { status: "APPROVED" } }),
      db.candidateStudio.count({ where: { status: "CONVERTED" } }),
      db.candidateStudio.count({ where: { phone: { not: null } } }),
      db.candidateStudio.count({ where: { website: { not: null } } }),
      db.candidateStudio.count({ where: { email: { not: null } } }),
      db.candidateStudio.count({
        where: {
          status: { not: "CONVERTED" },
          OR: [
            { lastCheckedAt: null },
            { lastCheckedAt: { lt: staleCutoff } },
          ],
        },
      }),
      db.candidateStudio.groupBy({
        by: ["countryCode"],
        where: { countryCode: { not: null } },
        _count: { countryCode: true },
        orderBy: { _count: { countryCode: "desc" } },
        take: 20,
      }),
      db.candidateStudioSource.groupBy({
        by: ["provider"],
        _count: { provider: true },
        orderBy: { _count: { provider: "desc" } },
      }),
      db.candidateStudioTransition.count({
        where: { reasonCode: "DUPLICATE_AUTO_MERGED" },
      }),
      db.marketplaceEvent.count({
        where: {
          eventType: "DISCOVERY_CONTACT_REPORTED",
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          },
        },
      }),
      db.candidateStudioClaim.count({
        where: { status: "VERIFIED" },
      }),
      db.candidateStudio.count({
        where: {
          status: "ENRICHED",
          convertedStudioId: null,
          phone: { not: null },
          lastCheckedAt: { gte: staleCutoff },
          claims: { none: { status: "VERIFIED" } },
          NOT: directoryStudioIdentityWhere(),
        },
      }),
    ]);

  const providerSourceCounts = new Map(
    providerRows.map((row) => [row.provider, row._count.provider]),
  );

  const pageCount = Math.max(1, Math.ceil(filteredCount / pageSize));

  function pageHref(targetPage: number) {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (rawSearch) params.set("q", rawSearch);
    if (country) params.set("country", country);
    if (freshnessFilter) params.set("freshness", freshnessFilter);
    if (targetPage > 1) params.set("page", String(targetPage));
    const suffix = params.toString();
    return suffix ? `/admin/discovery?${suffix}` : "/admin/discovery";
  }

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-5 py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-acid">
              Supply intelligence
            </span>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              Discovery workspace
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">
              Review external studio candidates without mixing them with bookable 36 inventory.
              Approval here never creates rooms, availability, payments or bookings.
            </p>
          </div>
          <Link href="/admin" className="text-xs font-bold text-zinc-500 hover:text-white">
            ← Admin
          </Link>
        </div>

        {query.imported && (
          <div className="mt-7 rounded-xl border border-acid/30 bg-acid/[0.04] p-4 text-sm text-acid">
            {query.provider === "OPENSTREETMAP" ? "OpenStreetMap" : "Overture"} import complete: {query.imported} studio candidates · {query.enriched || "0"} enriched · {query.review || "0"} review · {query.matched || "0"} matched · {query.refreshed || "0"} refreshed.
          </div>
        )}
        {query.importError && (
          <div className="mt-7 rounded-xl border border-red-900/60 bg-red-950/20 p-4 text-sm text-red-300">
            {query.importError === "scan-rate-limited"
              ? "Provider imports are limited to four per admin per hour."
              : query.importError === "snapshot-not-ready"
                ? "The selected provider snapshot has not been generated yet."
                : query.importError === "snapshot-empty"
                  ? "The selected provider snapshot contains no studio candidates, so nothing was imported."
                  : "The provider import could not be completed."}
          </div>
        )}

        <section className="mt-7 rounded-2xl border border-sky-900/40 bg-sky-950/[0.08] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-sky-300">
                Global contact directory
              </span>
              <h2 className="mt-2 text-2xl font-black">Live import coverage</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                These numbers come directly from the discovery database and update as global
                contact batches land. Imported contacts remain directory-only: they do not
                create rooms, prices, availability, payments or bookings.
              </p>
            </div>
            <Link href="/discover" className="text-xs font-black text-sky-300 hover:text-white">
              Open public directory →
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {[
              ["All candidates", total],
              ["With public phone", withPhone],
              ["With website", withWebsite],
              ["With email", withEmail],
              ["Enriched", enriched],
              ["Needs review", review],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-zinc-900 bg-zinc-950/60 p-4">
                <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-zinc-600">
                  {label}
                </span>
                <b className="mt-2 block text-2xl font-black">{value}</b>
              </div>
            ))}
          </div>

          {countryRows.length > 0 && (
            <div className="mt-5 border-t border-zinc-900 pt-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">
                Top countries in the discovery database
              </span>
              <div className="mt-3 flex flex-wrap gap-2">
                {countryRows.slice(0, 12).map((row) => (
                  <Link
                    key={row.countryCode!}
                    href={"/admin/discovery?country=" + row.countryCode}
                    className="rounded-full border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-sky-900 hover:text-sky-300"
                  >
                    {row.countryCode} · {row._count.countryCode}
                  </Link>
                ))}
              </div>
            </div>
          )}
          <div className="mt-5 grid gap-3 border-t border-zinc-900 pt-5 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-zinc-900 bg-zinc-950/60 p-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-zinc-600">
                Safe duplicate merges
              </span>
              <b className="mt-2 block text-2xl font-black text-emerald-300">
                {duplicateMerges}
              </b>
              <p className="mt-1 text-[11px] leading-5 text-zinc-600">
                Conservative automatic merges recorded in the audit trail.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-900 bg-zinc-950/60 p-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-zinc-600">
                Hidden weak matches
              </span>
              <b className="mt-2 block text-2xl font-black text-amber-300">
                {hiddenWeakIdentity}
              </b>
              <p className="mt-1 text-[11px] leading-5 text-zinc-600">
                Fresh enriched contacts withheld from public search by the studio-identity gate.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-900 bg-zinc-950/60 p-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-zinc-600">
                Owner verified
              </span>
              <b className="mt-2 block text-2xl font-black text-sky-300">
                {verifiedClaims}
              </b>
              <p className="mt-1 text-[11px] leading-5 text-zinc-600">
                Directory ownership claims approved by an admin.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-900 bg-zinc-950/60 p-4">
              <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-zinc-600">
                Reports · 30 days
              </span>
              <b className="mt-2 block text-2xl font-black">
                {contactReports30d}
              </b>
              <p className="mt-1 text-[11px] leading-5 text-zinc-600">
                User reports about wrong phones, closed businesses, duplicates or bad listing data.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-7 rounded-2xl border border-acid/20 bg-acid/[0.03] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">
                Rollout control
              </span>
              <h2 className="mt-2 text-2xl font-black">Public launch scopes</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-500">
                Public contact discovery and ownership claims are global. Only bookable-studio onboarding remains restricted to explicitly supported booking markets.
              </p>
            </div>
            <span className="rounded-full border border-acid/20 px-3 py-1 text-xs font-black text-acid">
              {DISCOVERY_ROLLOUT_SCOPES.length} active scope{DISCOVERY_ROLLOUT_SCOPES.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {DISCOVERY_ROLLOUT_SCOPES.map((scope) => (
              <div key={scope.countryCode + ":" + scope.city} className="rounded-xl border border-zinc-900 bg-zinc-950/70 p-4">
                <b className="text-sm">{scope.city} · {scope.countryCode}</b>
                <p className="mt-2 text-xs leading-5 text-zinc-600">
                  Public {scope.publicDiscovery ? "✓" : "—"} · Claims {scope.claims ? "✓" : "—"} · Onboarding {scope.onboarding ? "✓" : "—"}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-7">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-sky-300">
                Discovery providers
              </span>
              <h2 className="mt-2 text-2xl font-black">Controlled provider expansion</h2>
            </div>
            <span className="text-xs text-zinc-600">
              {DISCOVERY_PROVIDERS.length} configured providers
            </span>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-sky-900/40 bg-sky-950/10 p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full border border-sky-900/50 px-2.5 py-1 text-[9px] font-black uppercase text-sky-300">
                  Primary
                </span>
                <span className="text-[10px] text-zinc-600">
                  {providerSourceCounts.get("OVERTURE") || 0} source rows
                </span>
              </div>
              <h3 className="mt-4 text-xl font-black">Overture Maps · Global contacts</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                The full global contact-only importer reads the latest Overture Places release
                and feeds public business contacts into the same normalization and deduplication
                pipeline. The repository snapshot below remains a small Casablanca seed tool.
              </p>
              <p className="mt-3 text-[10px] leading-5 text-zinc-700">
                Snapshot {overtureSnapshot.generatedAt ? `generated ${new Date(overtureSnapshot.generatedAt).toLocaleString("en", { timeZone: "UTC" })} UTC · ${overtureSnapshot.recordCount} candidates from ${overtureSnapshot.totalPlacesInBbox} places` : "not generated yet"}
              </p>
              <form action={importOvertureAction} className="mt-4">
                <button className="rounded-xl bg-sky-300 px-5 py-3 text-xs font-black text-black">
                  Import Casablanca snapshot
                </button>
              </form>
            </article>

            <article className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="rounded-full border border-zinc-700 px-2.5 py-1 text-[9px] font-black uppercase text-zinc-400">
                  Secondary
                </span>
                <span className="text-[10px] text-zinc-600">
                  {providerSourceCounts.get("OPENSTREETMAP") || 0} source rows
                </span>
              </div>
              <h3 className="mt-4 text-xl font-black">OpenStreetMap · Casablanca</h3>
              <p className="mt-2 text-sm leading-6 text-zinc-500">
                Independent ODbL location evidence from a Morocco PBF extract. It uses the same normalization and deduplication gate as Overture.
              </p>
              <p className="mt-3 text-[10px] leading-5 text-zinc-700">
                Snapshot {osmSnapshot.generatedAt ? `generated ${new Date(osmSnapshot.generatedAt).toLocaleString("en", { timeZone: "UTC" })} UTC · ${osmSnapshot.rawElementCount} raw elements` : "not generated yet"}
              </p>
              <form action={importOpenStreetMapAction} className="mt-4">
                <button
                  disabled={osmSnapshot.rawElementCount === 0}
                  className="rounded-xl border border-zinc-700 px-5 py-3 text-xs font-black text-zinc-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {osmSnapshot.rawElementCount === 0 ? "Snapshot currently empty" : "Import OSM snapshot"}
                </button>
              </form>
            </article>
          </div>
        </section>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {[
            ["All candidates", total, "ALL"],
            ["Discovered", discovered, "DISCOVERED"],
            ["Enriched", enriched, "ENRICHED"],
            ["Needs review", review, "REVIEW_REQUIRED"],
            ["Approved", approved, "APPROVED"],
            ["Converted", converted, "CONVERTED"],
            ["Stale / unchecked", staleCount, "STALE"],
          ].map(([label, value, valueStatus]) => (
            <Link
              key={String(label)}
              href={
                valueStatus === "ALL"
                  ? "/admin/discovery"
                  : valueStatus === "STALE"
                    ? "/admin/discovery?freshness=STALE"
                    : `/admin/discovery?status=${valueStatus}`
              }
              className="panel transition hover:border-zinc-700"
            >
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">
                {label}
              </span>
              <b className="mt-3 block text-3xl font-black">{value}</b>
            </Link>
          ))}
        </div>

        <form className="mt-7 grid gap-3 rounded-2xl border border-zinc-900 bg-zinc-950/70 p-4 md:grid-cols-[1fr_180px_160px_auto]">
          <input
            className="field"
            name="q"
            defaultValue={rawSearch}
            placeholder="Search name, city, website, phone…"
          />
          <select className="field" name="status" defaultValue={status || "ALL"}>
            <option value="ALL">All statuses</option>
            {Object.values(CandidateStudioStatus).map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </select>
          <select className="field" name="country" defaultValue={country}>
            <option value="">All countries</option>
            {countryRows.map((row) => (
              <option key={row.countryCode!} value={row.countryCode!}>
                {row.countryCode} · {row._count.countryCode}
              </option>
            ))}
          </select>
          <button className="button-dark">Filter</button>
        </form>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-600">
          <span>
            {filteredCount} result{filteredCount === 1 ? "" : "s"} · page {Math.min(page, pageCount)} of {pageCount}
          </span>
          {(status || rawSearch || country || freshnessFilter) && (
            <Link href="/admin/discovery" className="font-bold text-zinc-400 hover:text-white">
              Clear filters
            </Link>
          )}
        </div>

        <section className="mt-5 space-y-3">
          {candidates.length === 0 ? (
            <div className="panel py-14 text-center">
              <b className="text-lg">No candidates in this view.</b>
              <p className="mt-2 text-sm text-zinc-600">
                The discovery database is intentionally empty until a provider or controlled fixture
                creates candidate records.
              </p>
            </div>
          ) : (
            candidates.map((candidate) => (
              <Link
                key={candidate.id}
                href={`/admin/discovery/${candidate.id}`}
                className="block rounded-2xl border border-zinc-900 bg-zinc-950/70 p-5 transition hover:border-zinc-700"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${STATUS_CLASS[candidate.status]}`}
                      >
                        {STATUS_LABELS[candidate.status]}
                      </span>
                      {candidate.status !== "CONVERTED" && (
                        <span
                          className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${discoveryFreshnessClass(discoveryFreshness(candidate.lastCheckedAt))}`}
                        >
                          {discoveryFreshnessLabel(discoveryFreshness(candidate.lastCheckedAt))}
                        </span>
                      )}
                      <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-700">
                        {candidate.category.replaceAll("_", " ")}
                      </span>
                    </div>
                    <h2 className="mt-3 truncate text-xl font-black">{candidate.name}</h2>
                    <p className="mt-1 text-xs text-zinc-500">
                      {[candidate.district, candidate.city, candidate.countryCode]
                        .filter(Boolean)
                        .join(" · ") || "Location unresolved"}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {candidate.sources.map((source) => (
                        <span
                          key={source.id}
                          className="rounded-full border border-zinc-800 px-2.5 py-1 text-[10px] text-zinc-400"
                        >
                          {source.provider}
                        </span>
                      ))}
                      {candidate._count.sources > candidate.sources.length && (
                        <span className="rounded-full border border-zinc-900 px-2.5 py-1 text-[10px] text-zinc-600">
                          +{candidate._count.sources - candidate.sources.length} sources
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right text-xs text-zinc-600">
                    <b className="block text-zinc-300">
                      {candidate._count.sources} source{candidate._count.sources === 1 ? "" : "s"}
                    </b>
                    <span>{candidate._count.transitions} lifecycle events</span>
                    <span className="mt-1 block">Updated {dateLabel(candidate.updatedAt)}</span>
                    {candidate.convertedStudio && (
                      <span className="mt-2 block text-emerald-300">
                        → {candidate.convertedStudio.name}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))
          )}
        </section>

        {pageCount > 1 && (
          <div className="mt-7 flex items-center justify-between">
            <Link
              href={pageHref(Math.max(1, page - 1))}
              aria-disabled={page <= 1}
              className={`button-dark ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
            >
              ← Previous
            </Link>
            <span className="text-xs text-zinc-600">
              {page} / {pageCount}
            </span>
            <Link
              href={pageHref(Math.min(pageCount, page + 1))}
              aria-disabled={page >= pageCount}
              className={`button-dark ${page >= pageCount ? "pointer-events-none opacity-40" : ""}`}
            >
              Next →
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
