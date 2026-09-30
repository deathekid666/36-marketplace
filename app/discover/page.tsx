import { DiscoveryStudioCategory, Prisma } from "@prisma/client";
import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { StudioMap } from "@/components/StudioMap";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { discoveryStaleCutoff } from "@/lib/discovery/freshness";
import { discoveryRolloutWhere } from "@/lib/discovery/rollout";

export const metadata = {
  title: "Global studio contacts · 36",
  description:
    "Browse public contact details for creative studios discovered by 36. Discovery listings are not bookable until a studio joins and is verified.",
};

function labelCategory(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function cleanPhoneHref(value: string) {
  return "tel:" + value.replace(/[^+\d]/g, "");
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

function countryName(code: string | null | undefined) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return normalized || "Unknown country";
  try {
    return regionNames.of(normalized) || normalized;
  } catch {
    return normalized;
  }
}

export default async function DiscoverStudiosPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    country?: string;
    city?: string;
    category?: string;
    page?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const query = await searchParams;
  const q = String(query.q || "").trim().slice(0, 120);
  const country = /^[A-Za-z]{2}$/.test(String(query.country || "").trim())
    ? String(query.country).trim().toUpperCase()
    : "";
  const city = String(query.city || "").trim().slice(0, 120);
  const category = Object.values(DiscoveryStudioCategory).includes(
    String(query.category || "") as DiscoveryStudioCategory,
  )
    ? (String(query.category) as DiscoveryStudioCategory)
    : "";
  const page = Math.max(
    1,
    Math.min(5000, Number.parseInt(String(query.page || "1"), 10) || 1),
  );
  const pageSize = 48;
  const staleCutoff = discoveryStaleCutoff();

  const visibility: Prisma.CandidateStudioWhereInput = {
    AND: [
      discoveryRolloutWhere("PUBLIC_DISCOVERY"),
      { phone: { not: null } },
      {
        OR: [
          { status: "CONVERTED" },
          { claims: { some: { status: "VERIFIED" } } },
          { status: "APPROVED", lastCheckedAt: { gte: staleCutoff } },
          { status: "ENRICHED", lastCheckedAt: { gte: staleCutoff } },
        ],
      },
      ...(q
        ? [
            {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { normalizedName: { contains: q, mode: "insensitive" as const } },
                { city: { contains: q, mode: "insensitive" as const } },
                { district: { contains: q, mode: "insensitive" as const } },
                { country: { contains: q, mode: "insensitive" as const } },
                { phone: { contains: q } },
              ],
            },
          ]
        : []),
      ...(country ? [{ countryCode: country }] : []),
      ...(city
        ? [{ city: { contains: city, mode: "insensitive" as const } }]
        : []),
      ...(category ? [{ category }] : []),
    ],
  };

  const geographyVisibility: Prisma.CandidateStudioWhereInput = {
    AND: [
      discoveryRolloutWhere("PUBLIC_DISCOVERY"),
      { phone: { not: null } },
      {
        OR: [
          { status: "CONVERTED" },
          { claims: { some: { status: "VERIFIED" } } },
          { status: "APPROVED", lastCheckedAt: { gte: staleCutoff } },
          { status: "ENRICHED", lastCheckedAt: { gte: staleCutoff } },
        ],
      },
    ],
  };

  const [candidates, total, countryRows, cityRows] = await Promise.all([
    db.candidateStudio.findMany({
      where: visibility,
      include: {
        convertedStudio: {
          select: { status: true },
        },
        sources: {
          where: { active: true },
          orderBy: { collectedAt: "desc" },
          take: 2,
          select: {
            id: true,
            provider: true,
            attribution: true,
          },
        },
        claims: {
          where: { status: "VERIFIED" },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.candidateStudio.count({ where: visibility }),
    db.candidateStudio.groupBy({
      by: ["countryCode"],
      where: geographyVisibility,
      _count: { countryCode: true },
      orderBy: { _count: { countryCode: "desc" } },
      take: 150,
    }),
    db.candidateStudio.groupBy({
      by: ["city"],
      where: {
        AND: [
          geographyVisibility,
          { city: { not: null } },
          ...(country ? [{ countryCode: country }] : []),
        ],
      },
      _count: { city: true },
      orderBy: { _count: { city: "desc" } },
      take: 80,
    }),
  ]);

  const visibleCandidates = candidates.filter(
    (candidate) => candidate.convertedStudio?.status !== "VERIFIED",
  );

  const rankedCandidates = [...visibleCandidates].sort((a, b) => {
    function score(candidate: (typeof visibleCandidates)[number]) {
      let value = 0;
      if (candidate.claims.length > 0) value += 100;
      if (candidate.status === "CONVERTED") value += 55;
      else if (candidate.status === "APPROVED") value += 35;
      if (candidate.website) value += 12;
      if (candidate.email) value += 10;
      if (candidate.instagram) value += 8;
      if (candidate.address) value += 6;
      if (candidate.latitude != null && candidate.longitude != null) value += 4;
      value += Math.min(6, candidate.sources.length * 3);
      return value;
    }

    const scoreDifference = score(b) - score(a);
    if (scoreDifference !== 0) return scoreDifference;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  const mapPoints = rankedCandidates
    .filter(
      (candidate) =>
        candidate.latitude != null && candidate.longitude != null,
    )
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      lat: Number(candidate.latitude),
      lng: Number(candidate.longitude),
      href: "/discover/" + candidate.slug,
      price: null,
    }));

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function pageHref(target: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (country) params.set("country", country);
    if (city) params.set("city", city);
    if (category) params.set("category", category);
    if (target > 1) params.set("page", String(target));
    return "/discover" + (params.toString() ? "?" + params.toString() : "");
  }

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />

      <section className="mx-auto max-w-[1500px] px-5 py-10">
        <div className="max-w-4xl">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">
            36 Global Directory
          </span>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
            Studio contacts around the world
          </h1>
          <p className="mt-4 text-sm leading-7 text-zinc-500">
            Public business phone numbers from external place data. These listings
            are contact-only and are not bookable on 36 unless the real studio
            later joins and passes verification.
          </p>
        </div>

        <form
          action="/discover"
          method="GET"
          className="mt-8 grid gap-3 rounded-3xl border border-zinc-800 bg-[#11120f] p-3 lg:grid-cols-[1fr_150px_190px_190px_auto]"
        >
          <label className="rounded-2xl px-4 py-2">
            <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
              Search
            </span>
            <input
              name="q"
              defaultValue={q}
              placeholder="Studio, city, area or phone"
              className="mt-1 w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-zinc-700"
            />
          </label>

          <label className="rounded-2xl border-t border-zinc-900 px-4 py-2 lg:border-l lg:border-t-0">
            <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
              Country
            </span>
            <select
              name="country"
              defaultValue={country}
              className="mt-1 w-full appearance-none bg-transparent text-sm font-semibold text-white outline-none"
            >
              <option value="" className="bg-zinc-950">
                All countries
              </option>
              {countryRows.map((row) => (
                <option
                  key={row.countryCode!}
                  value={row.countryCode!}
                  className="bg-zinc-950"
                >
                  {countryName(row.countryCode)} · {row._count.countryCode}
                </option>
              ))}
            </select>
          </label>

          <label className="rounded-2xl border-t border-zinc-900 px-4 py-2 lg:border-l lg:border-t-0">
            <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
              City
            </span>
            <select
              name="city"
              defaultValue={city}
              className="mt-1 w-full appearance-none bg-transparent text-sm font-semibold text-white outline-none"
            >
              <option value="" className="bg-zinc-950">
                All cities
              </option>
              {cityRows.map((row) => (
                <option key={row.city!} value={row.city!} className="bg-zinc-950">
                  {row.city} · {row._count.city}
                </option>
              ))}
            </select>
          </label>

          <label className="rounded-2xl border-t border-zinc-900 px-4 py-2 lg:border-l lg:border-t-0">
            <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
              Studio type
            </span>
            <select
              name="category"
              defaultValue={category}
              className="mt-1 w-full appearance-none bg-transparent text-sm font-semibold text-white outline-none"
            >
              <option value="" className="bg-zinc-950">
                All types
              </option>
              {Object.values(DiscoveryStudioCategory).map((value) => (
                <option key={value} value={value} className="bg-zinc-950">
                  {labelCategory(value)}
                </option>
              ))}
            </select>
          </label>

          <button className="rounded-2xl bg-sky-300 px-6 py-3 text-sm font-black text-black">
            Search
          </button>
        </form>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-zinc-500">
            <b className="text-zinc-200">{total}</b> contact listing
            {total === 1 ? "" : "s"}
            {country ? " in " + countryName(country) : ""}
            {city ? " · " + city : ""}
            {category ? " · " + labelCategory(category) : ""}
          </p>
          <Link href="/studios" className="text-xs font-black text-acid">
            Show verified bookable studios →
          </Link>
        </div>

        {visibleCandidates.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-zinc-800 p-14 text-center">
            <h2 className="text-xl font-black">No contact listings match this search</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-600">
              Try another country, city or studio name.
            </p>
          </div>
        ) : (
          <div
            className={
              mapPoints.length > 0
                ? "mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.05fr)_minmax(460px,.95fr)]"
                : "mt-7"
            }
          >
            <div
              className={
                mapPoints.length > 0
                  ? "grid gap-5 md:grid-cols-2"
                  : "grid gap-5 md:grid-cols-2 xl:grid-cols-3"
              }
            >
              {rankedCandidates.map((candidate) => {
                const ownershipVerified = candidate.claims.length > 0;
                const reviewed =
                  candidate.status === "APPROVED" ||
                  candidate.status === "CONVERTED";

                return (
                  <article
                    key={candidate.id}
                    className="rounded-3xl border border-zinc-900 bg-zinc-950/60 p-5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <span
                        className={
                          "rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] " +
                          (ownershipVerified
                            ? "border-emerald-900/50 bg-emerald-950/20 text-emerald-300"
                            : candidate.status === "CONVERTED"
                              ? "border-amber-900/50 bg-amber-950/20 text-amber-300"
                              : reviewed
                                ? "border-sky-900/50 bg-sky-950/20 text-sky-300"
                                : "border-zinc-800 text-zinc-400")
                        }
                      >
                        {ownershipVerified
                          ? "Owner verified"
                          : candidate.status === "CONVERTED"
                            ? "Owner onboarding"
                            : reviewed
                              ? "Reviewed contact"
                              : "Public contact"}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-700">
                        {labelCategory(candidate.category)}
                      </span>
                    </div>

                    <h2 className="mt-5 text-xl font-black">{candidate.name}</h2>
                    <p className="mt-2 text-sm text-zinc-500">
                      {[
                        candidate.district,
                        candidate.city,
                        candidate.countryCode ? countryName(candidate.countryCode) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Location available"}
                    </p>

                    {candidate.phone && (
                      <a
                        href={cleanPhoneHref(candidate.phone)}
                        className="mt-4 flex items-center justify-between rounded-xl border border-zinc-800 bg-black/20 px-4 py-3 text-sm transition hover:border-sky-800"
                      >
                        <span className="text-zinc-500">☎ Public phone</span>
                        <b className="text-sky-300">{candidate.phone}</b>
                      </a>
                    )}

                    <p className="mt-4 text-xs leading-5 text-zinc-600">
                      Contact-only listing · not bookable on 36.
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {candidate.sources.map((source) => (
                        <span
                          key={source.id}
                          className="rounded-full border border-zinc-800 px-2.5 py-1 text-[10px] text-zinc-500"
                        >
                          {source.provider}
                        </span>
                      ))}
                    </div>

                    <Link
                      href={"/discover/" + candidate.slug}
                      className="mt-5 inline-flex text-xs font-black text-sky-300 hover:text-white"
                    >
                      View contact listing →
                    </Link>
                  </article>
                );
              })}
            </div>

            {mapPoints.length > 0 && (
              <aside className="hidden xl:block">
                <div className="sticky top-5">
                  <div className="mb-3 flex items-center justify-between">
                    <b className="text-sm">Map</b>
                    <span className="text-xs text-zinc-600">
                      {mapPoints.length} locations on this page
                    </span>
                  </div>
                  <StudioMap points={mapPoints} />
                </div>
              </aside>
            )}

            {mapPoints.length > 0 && (
              <div className="xl:hidden">
                <StudioMap points={mapPoints} />
              </div>
            )}
          </div>
        )}

        {pageCount > 1 && (
          <div className="mt-8 flex items-center justify-between">
            <Link
              href={pageHref(Math.max(1, page - 1))}
              className={
                "button-dark " +
                (page <= 1 ? "pointer-events-none opacity-40" : "")
              }
            >
              ← Previous
            </Link>
            <span className="text-xs text-zinc-600">
              Page {page} of {pageCount}
            </span>
            <Link
              href={pageHref(Math.min(pageCount, page + 1))}
              className={
                "button-dark " +
                (page >= pageCount ? "pointer-events-none opacity-40" : "")
              }
            >
              Next →
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
