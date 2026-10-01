import { DiscoveryStudioCategory, Prisma } from "@prisma/client";
import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import {
  DirectoryLocationPicker,
  type DirectoryLocationOption,
} from "@/components/DirectoryLocationPicker";
import { MapFocusButton } from "@/components/MapFocusButton";
import { StudioMap } from "@/components/StudioMap";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { discoveryStaleCutoff } from "@/lib/discovery/freshness";
import { directoryStudioIdentityWhere } from "@/lib/discovery/public-eligibility";
import {
  parseDirectoryProfileV2,
  profileV2Completeness,
} from "@/lib/discovery/profile-v2";
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

function safeExternalUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function parseCoordinate(
  value: string | undefined,
  min: number,
  max: number,
) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const deltaLat = radians(lat2 - lat1);
  const deltaLng = radians(lng2 - lng1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(radians(lat1)) *
      Math.cos(radians(lat2)) *
      Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
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
    verified?: string;
    website?: string;
    email?: string;
    lat?: string;
    lng?: string;
    radius?: string;
    north?: string;
    south?: string;
    east?: string;
    west?: string;
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
  const verifiedOnly = query.verified === "1";
  const websiteOnly = query.website === "1";
  const emailOnly = query.email === "1";
  const centerLat = parseCoordinate(query.lat, -90, 90);
  const centerLng = parseCoordinate(query.lng, -180, 180);
  const radiusValue = Number.parseInt(String(query.radius || ""), 10);
  const radiusKm = [5, 10, 25, 50, 100].includes(radiusValue)
    ? radiusValue
    : null;
  const north = parseCoordinate(query.north, -90, 90);
  const south = parseCoordinate(query.south, -90, 90);
  const east = parseCoordinate(query.east, -180, 180);
  const west = parseCoordinate(query.west, -180, 180);
  const mapBoundsActive =
    north != null &&
    south != null &&
    east != null &&
    west != null &&
    north > south &&
    east > west;
  const radiusActive =
    !mapBoundsActive &&
    radiusKm != null &&
    centerLat != null &&
    centerLng != null;
  const qualityFilters: Prisma.CandidateStudioWhereInput[] = [];
  if (verifiedOnly) {
    qualityFilters.push({ claims: { some: { status: "VERIFIED" } } });
  }
  if (websiteOnly) {
    qualityFilters.push({ website: { not: null } });
  }
  if (emailOnly) {
    qualityFilters.push({ email: { not: null } });
  }
  const page = Math.max(
    1,
    Math.min(5000, Number.parseInt(String(query.page || "1"), 10) || 1),
  );
  const pageSize = 48;
  const staleCutoff = discoveryStaleCutoff();

  let radiusCandidateIds: string[] | null = null;
  if (radiusActive && centerLat != null && centerLng != null && radiusKm != null) {
    const latDelta = radiusKm / 111.32;
    const longitudeScale = Math.max(
      0.15,
      Math.cos((centerLat * Math.PI) / 180),
    );
    const lngDelta = radiusKm / (111.32 * longitudeScale);

    const coordinateCandidates = await db.candidateStudio.findMany({
      where: {
        latitude: {
          gte: centerLat - latDelta,
          lte: centerLat + latDelta,
        },
        longitude: {
          gte: centerLng - lngDelta,
          lte: centerLng + lngDelta,
        },
      },
      select: { id: true, latitude: true, longitude: true },
      take: 20_000,
    });

    radiusCandidateIds = coordinateCandidates
      .filter((candidate) => {
        if (candidate.latitude == null || candidate.longitude == null) return false;
        return (
          haversineKm(
            centerLat,
            centerLng,
            Number(candidate.latitude),
            Number(candidate.longitude),
          ) <= radiusKm
        );
      })
      .map((candidate) => candidate.id);
  }

  const geoFilters: Prisma.CandidateStudioWhereInput[] = [];
  if (mapBoundsActive) {
    geoFilters.push(
      { latitude: { gte: south!, lte: north! } },
      { longitude: { gte: west!, lte: east! } },
    );
  } else {
    if (country) geoFilters.push({ countryCode: country });
    if (city) {
      geoFilters.push({
        city: { contains: city, mode: "insensitive" as const },
      });
    }
    if (radiusCandidateIds) {
      geoFilters.push({ id: { in: radiusCandidateIds } });
    }
  }

  const visibility: Prisma.CandidateStudioWhereInput = {
    AND: [
      discoveryRolloutWhere("PUBLIC_DISCOVERY"),
      { phone: { not: null } },
      {
        OR: [
          { status: "CONVERTED" },
          { claims: { some: { status: "VERIFIED" } } },
          { status: "APPROVED", lastCheckedAt: { gte: staleCutoff } },
          {
            AND: [
              { status: "ENRICHED", lastCheckedAt: { gte: staleCutoff } },
              directoryStudioIdentityWhere(),
            ],
          },
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
      ...geoFilters,
      ...(category ? [{ category }] : []),
      ...qualityFilters,
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
          {
            AND: [
              { status: "ENRICHED", lastCheckedAt: { gte: staleCutoff } },
              directoryStudioIdentityWhere(),
            ],
          },
        ],
      },
      ...qualityFilters,
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
        transitions: {
          where: { reasonCode: "VERIFIED_OWNER_PROFILE_UPDATE" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { metadata: true },
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
      by: ["city", "countryCode"],
      where: {
        AND: [
          geographyVisibility,
          { city: { not: null } },
          { countryCode: { not: null } },
          { latitude: { not: null } },
          { longitude: { not: null } },
        ],
      },
      _count: { city: true },
      _avg: { latitude: true, longitude: true },
      orderBy: { _count: { city: "desc" } },
      take: 250,
    }),
  ]);

  const locationOptions: DirectoryLocationOption[] = [
    ...cityRows
      .filter(
        (row) =>
          row.city &&
          row.countryCode &&
          row._avg.latitude != null &&
          row._avg.longitude != null,
      )
      .map((row) => ({
        key: "city:" + row.countryCode + ":" + row.city,
        label:
          row.city +
          ", " +
          countryName(row.countryCode),
        city: row.city || "",
        countryCode: row.countryCode || "",
        lat: row._avg.latitude == null ? null : Number(row._avg.latitude),
        lng: row._avg.longitude == null ? null : Number(row._avg.longitude),
        count: row._count.city,
      })),
    ...countryRows.map((row) => ({
      key: "country:" + row.countryCode,
      label: countryName(row.countryCode),
      city: "",
      countryCode: row.countryCode || "",
      lat: null,
      lng: null,
      count: row._count.countryCode,
    })),
  ];

  const visibleCandidates = candidates.filter(
    (candidate) => candidate.convertedStudio?.status !== "VERIFIED",
  );

  const rankedCandidates = [...visibleCandidates].sort((a, b) => {
    function score(candidate: (typeof visibleCandidates)[number]) {
      let value = 0;
      if (candidate.claims.length > 0) {
        value += 100;
        value +=
          profileV2Completeness(
            parseDirectoryProfileV2(candidate.transitions[0]?.metadata),
          ) * 4;
      }
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
    .map((candidate) => {
      const profile = parseDirectoryProfileV2(
        candidate.transitions[0]?.metadata,
      );

      return {
        id: candidate.id,
        name: candidate.name,
        lat: Number(candidate.latitude),
        lng: Number(candidate.longitude),
        href: "/discover/" + candidate.slug,
        price: null,
        kind: "CONTACT" as const,
        category: labelCategory(candidate.category),
        rating: null,
        photoUrl: profile.photoUrls[0] || null,
      };
    });

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  function pageHref(target: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (country) params.set("country", country);
    if (city) params.set("city", city);
    if (category) params.set("category", category);
    if (verifiedOnly) params.set("verified", "1");
    if (websiteOnly) params.set("website", "1");
    if (emailOnly) params.set("email", "1");
    if (radiusActive && centerLat != null && centerLng != null && radiusKm != null) {
      params.set("lat", String(centerLat));
      params.set("lng", String(centerLng));
      params.set("radius", String(radiusKm));
    }
    if (mapBoundsActive) {
      params.set("north", String(north));
      params.set("south", String(south));
      params.set("east", String(east));
      params.set("west", String(west));
    }
    if (target > 1) params.set("page", String(target));
    return "/discover" + (params.toString() ? "?" + params.toString() : "");
  }

  return (
    <main className="min-h-screen bg-white text-[#222]">
      <AppHeader user={user} />

      <section className="mx-auto max-w-[1500px] px-5 py-10">
        <div className="max-w-4xl">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-sky-600">
            36 Global Directory
          </span>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
            Studio contacts around the world
          </h1>
          <p className="mt-4 text-sm leading-7 text-[#717171]">
            Public business phone numbers from external place data. These listings
            are contact-only and are not bookable on 36 unless the real studio
            later joins and passes verification.
          </p>
        </div>

        <form
          action="/discover"
          method="GET"
          className="mt-8 grid gap-3 rounded-3xl border border-[#dddddd] bg-white p-3 lg:grid-cols-[minmax(220px,1fr)_minmax(250px,1fr)_190px_auto]"
        >
          <label className="rounded-2xl px-4 py-2">
            <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[#8a8a8a]">
              Search
            </span>
            <input
              name="q"
              defaultValue={q}
              placeholder="Studio, city, area or phone"
              className="mt-1 w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-[#a3a3a3]"
            />
          </label>

          <DirectoryLocationPicker
            options={locationOptions}
            defaultCity={mapBoundsActive ? "" : city}
            defaultCountryCode={mapBoundsActive ? "" : country}
            defaultLat={radiusActive ? centerLat : null}
            defaultLng={radiusActive ? centerLng : null}
            defaultRadius={radiusActive ? radiusKm : null}
            mapAreaActive={mapBoundsActive}
          />

          <label className="rounded-2xl border-t border-[#ebebeb] px-4 py-2 lg:border-l lg:border-t-0">
            <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[#8a8a8a]">
              Studio type
            </span>
            <select
              name="category"
              defaultValue={category}
              className="mt-1 w-full appearance-none bg-transparent text-sm font-semibold text-white outline-none"
            >
              <option value="" className="bg-white">
                All types
              </option>
              {Object.values(DiscoveryStudioCategory).map((value) => (
                <option key={value} value={value} className="bg-white">
                  {labelCategory(value)}
                </option>
              ))}
            </select>
          </label>

          <button className="rounded-2xl bg-sky-300 px-6 py-3 text-sm font-black text-black">
            Search
          </button>

          <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-[#ebebeb] px-4 py-3 text-xs font-bold text-[#555555]">
            <input
              type="checkbox"
              name="verified"
              value="1"
              defaultChecked={verifiedOnly}
              className="accent-sky-300"
            />
            Owner verified
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-[#ebebeb] px-4 py-3 text-xs font-bold text-[#555555]">
            <input
              type="checkbox"
              name="website"
              value="1"
              defaultChecked={websiteOnly}
              className="accent-sky-300"
            />
            Has website
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-[#ebebeb] px-4 py-3 text-xs font-bold text-[#555555]">
            <input
              type="checkbox"
              name="email"
              value="1"
              defaultChecked={emailOnly}
              className="accent-sky-300"
            />
            Has email
          </label>
        </form>

        <div className="mt-7 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-[#717171]">
            <b className="text-[#222222]">{total}</b> contact listing
            {total === 1 ? "" : "s"}
            {mapBoundsActive
              ? " · Map area"
              : country
                ? " in " + countryName(country)
                : ""}
            {!mapBoundsActive && city ? " · " + city : ""}
            {radiusActive && radiusKm ? " · within " + radiusKm + " km" : ""}
            {category ? " · " + labelCategory(category) : ""}
            {verifiedOnly ? " · Owner verified" : ""}
            {websiteOnly ? " · Website" : ""}
            {emailOnly ? " · Email" : ""}
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <Link
              href={user ? "/discover/add" : "/auth/login?next=%2Fdiscover%2Fadd"}
              className="text-xs font-black text-sky-600 hover:text-[#222222]"
            >
              + Suggest a missing studio
            </Link>
            <Link href="/studios" className="text-xs font-black text-acid">
              Show verified bookable studios →
            </Link>
          </div>
        </div>

        {visibleCandidates.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-[#dddddd] p-14 text-center">
            <h2 className="text-xl font-black">No contact listings match this search</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-[#8a8a8a]">
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
            {mapPoints.length > 0 && (
              <aside className="order-1 xl:order-2">
                <div className="sticky top-5">
                  <div className="mb-3 flex items-center justify-between">
                    <b className="text-sm">Map</b>
                    <span className="text-xs text-[#8a8a8a]">
                      {mapPoints.length} locations on this page
                    </span>
                  </div>
                  <StudioMap points={mapPoints} searchArea />
                </div>
              </aside>
            )}

            <div
              className={
                mapPoints.length > 0
                  ? "order-2 grid gap-5 md:grid-cols-2 xl:order-1"
                  : "grid gap-5 md:grid-cols-2 xl:grid-cols-3"
              }
            >
              {rankedCandidates.map((candidate) => {
                const ownershipVerified = candidate.claims.length > 0;
                const profileV2 = ownershipVerified
                  ? parseDirectoryProfileV2(candidate.transitions[0]?.metadata)
                  : parseDirectoryProfileV2(null);
                const heroPhoto = profileV2.photoUrls[0] || null;
                const website = safeExternalUrl(candidate.website);
                const reviewed =
                  candidate.status === "APPROVED" ||
                  candidate.status === "CONVERTED";

                return (
                  <article
                    key={candidate.id}
                    id={"studio-card-" + candidate.id}
                    data-directory-card
                    data-studio-id={candidate.id}
                    data-map-active="false"
                    className="rounded-3xl border border-[#ebebeb] bg-white p-5 transition"
                  >
                    {heroPhoto && (
                      <a
                        href={"/discover/" + candidate.slug}
                        className="-mx-5 -mt-5 mb-5 block overflow-hidden rounded-t-3xl border-b border-[#ebebeb]"
                      >
                        <img
                          src={heroPhoto}
                          alt={candidate.name + " studio"}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-48 w-full object-cover transition duration-300 hover:scale-[1.02]"
                        />
                      </a>
                    )}

                    <div className="flex items-start justify-between gap-3">
                      <span
                        className={
                          "rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] " +
                          (ownershipVerified
                            ? "border-emerald-900/50 bg-emerald-950/20 text-emerald-600"
                            : candidate.status === "CONVERTED"
                              ? "border-amber-900/50 bg-amber-950/20 text-amber-600"
                              : reviewed
                                ? "border-sky-200/50 bg-sky-950/20 text-sky-600"
                                : "border-[#dddddd] text-[#555555]")
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
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#a3a3a3]">
                        {labelCategory(candidate.category)}
                      </span>
                    </div>

                    <h2 className="mt-5 text-xl font-black">{candidate.name}</h2>
                    <p className="mt-2 text-sm text-[#717171]">
                      {[
                        candidate.district,
                        candidate.city,
                        candidate.countryCode ? countryName(candidate.countryCode) : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Location available"}
                    </p>

                    {profileV2.description && (
                      <p className="mt-3 line-clamp-2 text-xs leading-5 text-[#717171]">
                        {profileV2.description}
                      </p>
                    )}

                    {profileV2.services.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {profileV2.services.slice(0, 3).map((service) => (
                          <span
                            key={service}
                            className="rounded-full border border-sky-200/30 bg-sky-950/10 px-2 py-1 text-[9px] font-bold text-sky-600"
                          >
                            {service}
                          </span>
                        ))}
                        {profileV2.services.length > 3 && (
                          <span className="rounded-full border border-[#ebebeb] px-2 py-1 text-[9px] text-[#8a8a8a]">
                            +{profileV2.services.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {candidate.phone && (
                      <a
                        href={cleanPhoneHref(candidate.phone)}
                        className="mt-4 flex items-center justify-between rounded-xl border border-[#dddddd] bg-[#f7f7f7] px-4 py-3 text-sm transition hover:border-sky-800"
                      >
                        <span className="text-[#717171]">☎ Public phone</span>
                        <b className="text-sky-600">{candidate.phone}</b>
                      </a>
                    )}

                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full border border-[#dddddd] px-2.5 py-1 text-[10px] font-bold text-[#717171]">
                        Phone ✓
                      </span>
                      {website && (
                        <a
                          href={website}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="rounded-full border border-[#dddddd] px-2.5 py-1 text-[10px] font-bold text-[#555555] hover:border-sky-800 hover:text-sky-600"
                        >
                          Website ↗
                        </a>
                      )}
                      {candidate.email && (
                        <a
                          href={"mailto:" + candidate.email}
                          className="rounded-full border border-[#dddddd] px-2.5 py-1 text-[10px] font-bold text-[#555555] hover:border-sky-800 hover:text-sky-600"
                        >
                          Email
                        </a>
                      )}
                    </div>

                    <p className="mt-4 text-xs leading-5 text-[#8a8a8a]">
                      Contact-only listing · not bookable on 36.
                    </p>

                    <div className="mt-4 flex flex-wrap gap-2">
                      {candidate.sources.map((source) => (
                        <span
                          key={source.id}
                          className="rounded-full border border-[#dddddd] px-2.5 py-1 text-[10px] text-[#717171]"
                        >
                          {source.provider}
                        </span>
                      ))}
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3">
                      <Link
                        href={"/discover/" + candidate.slug}
                        className="inline-flex text-xs font-black text-sky-600 hover:text-[#222222]"
                      >
                        View contact listing →
                      </Link>
                      <MapFocusButton
                        studioId={candidate.id}
                        hasCoordinates={
                          candidate.latitude != null &&
                          candidate.longitude != null
                        }
                      />
                    </div>
                  </article>
                );
              })}
            </div>

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
            <span className="text-xs text-[#8a8a8a]">
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
