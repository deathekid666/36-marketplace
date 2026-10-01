import { Prisma } from "@prisma/client";
import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import {
  DirectoryLocationPicker,
  type DirectoryLocationOption,
} from "@/components/DirectoryLocationPicker";
import { CreativeExplorerMap } from "@/components/CreativeExplorerMap";
import { MapFocusButton } from "@/components/MapFocusButton";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  classifyCreativeSpace,
  creativeCategoryLabel,
  matchesCreativeCategory,
  type CreativeSpaceCategoryKey,
} from "@/lib/discovery/creative-classification";
import { discoveryStaleCutoff } from "@/lib/discovery/freshness";
import { directoryStudioIdentityWhere } from "@/lib/discovery/public-eligibility";
import {
  parseDirectoryProfileV2,
  profileV2Completeness,
} from "@/lib/discovery/profile-v2";
import { discoveryRolloutWhere } from "@/lib/discovery/rollout";

export const metadata = {
  title: "Explore creative spaces · 36",
  description:
    "Explore recording, podcast, photo, video, rehearsal and other creative spaces around the world.",
};

const CATEGORY_TABS = [
  { value: "", label: "All", icon: "⌘", tone: "all" },
  { value: "RECORDING", label: "Recording", icon: "●", tone: "recording" },
  { value: "PODCAST", label: "Podcast", icon: "◉", tone: "podcast" },
  { value: "PHOTO", label: "Photo", icon: "▣", tone: "photo" },
  { value: "VIDEO", label: "Video", icon: "▶", tone: "video" },
  { value: "REHEARSAL", label: "Rehearsal", icon: "♪", tone: "rehearsal" },
  { value: "IMAGE_LAB", label: "Image Lab", icon: "△", tone: "lab" },
  { value: "VOICE_OVER", label: "Voice-over", icon: "▮", tone: "voice" },
  { value: "OTHER", label: "More", icon: "•••", tone: "more" },
] as const;

type UiCategory = (typeof CATEGORY_TABS)[number]["value"];

function labelCategory(value: string) {
  const normalized = String(value || "").toUpperCase() as CreativeSpaceCategoryKey;
  try {
    return creativeCategoryLabel(normalized);
  } catch {
    return value
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }
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

function categoryHref(
  category: UiCategory,
  query: {
    q: string;
    country: string;
    city: string;
    lat: number | null;
    lng: number | null;
    radiusKm: number | null;
  },
) {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.country) params.set("country", query.country);
  if (query.city) params.set("city", query.city);
  if (query.lat != null) params.set("lat", String(query.lat));
  if (query.lng != null) params.set("lng", String(query.lng));
  if (query.radiusKm != null) params.set("radius", String(query.radiusKm));
  if (category) params.set("category", category);
  return "/discover" + (params.toString() ? "?" + params.toString() : "");
}

function categoryIcon(category: string) {
  return (
    CATEGORY_TABS.find((item) => item.value === category)?.icon ||
    (category === "POST_PRODUCTION" ? "△" : "•")
  );
}

export default async function DiscoverStudiosPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    country?: string;
    city?: string;
    category?: string;
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
  const rawCategory = String(query.category || "").trim().toUpperCase();
  const category = CATEGORY_TABS.some((item) => item.value === rawCategory)
    ? (rawCategory as UiCategory)
    : "";

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

  const page = Math.max(
    1,
    Math.min(5000, Number.parseInt(String(query.page || "1"), 10) || 1),
  );
  const pageSize = 30;
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
        latitude: { gte: centerLat - latDelta, lte: centerLat + latDelta },
        longitude: { gte: centerLng - lngDelta, lte: centerLng + lngDelta },
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
    if (radiusCandidateIds) geoFilters.push({ id: { in: radiusCandidateIds } });
  }

  const candidateBase: Prisma.CandidateStudioWhereInput = {
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
              ],
            },
          ]
        : []),
      ...geoFilters,
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
    ],
  };

  const bookableGeo: Prisma.StudioWhereInput[] = [];
  if (mapBoundsActive) {
    bookableGeo.push(
      { latitude: { gte: south!, lte: north! } },
      { longitude: { gte: west!, lte: east! } },
    );
  } else {
    if (city) bookableGeo.push({ city: { contains: city, mode: "insensitive" } });
    if (country && country !== "MA") {
      bookableGeo.push({ id: "00000000-0000-0000-0000-000000000000" });
    }
  }

  const bookableBaseWhere: Prisma.StudioWhereInput = {
    AND: [
      { status: "VERIFIED" },
      { latitude: { not: null } },
      { longitude: { not: null } },
      ...(q
        ? [
            {
              OR: [
                { name: { contains: q, mode: "insensitive" as const } },
                { city: { contains: q, mode: "insensitive" as const } },
                { neighborhood: { contains: q, mode: "insensitive" as const } },
                { address: { contains: q, mode: "insensitive" as const } },
              ],
            },
          ]
        : []),
      ...bookableGeo,
    ],
  };

  const classificationCandidates = await db.candidateStudio.findMany({
    where: candidateBase,
    select: {
      id: true,
      name: true,
      slug: true,
      category: true,
      latitude: true,
      longitude: true,
      city: true,
      countryCode: true,
      convertedStudio: { select: { status: true } },
      sources: {
        where: { active: true },
        orderBy: { collectedAt: "desc" },
        take: 3,
        select: { providerCategory: true },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
  });

  const classifiedContacts = classificationCandidates
    .filter((candidate) => candidate.convertedStudio?.status !== "VERIFIED")
    .map((candidate) => ({
      candidate,
      classification: classifyCreativeSpace({
        name: candidate.name,
        storedCategory: candidate.category,
        providerCategories: candidate.sources.map((source) => source.providerCategory),
      }),
    }));

  const selectedClassifiedContacts = category
    ? classifiedContacts.filter((entry) =>
        matchesCreativeCategory(entry.classification.key, category),
      )
    : classifiedContacts;

  const selectedContactIds = selectedClassifiedContacts.map(
    (entry) => entry.candidate.id,
  );

  const candidateVisibility: Prisma.CandidateStudioWhereInput = {
    id: {
      in:
        selectedContactIds.length > 0
          ? selectedContactIds
          : ["00000000-0000-0000-0000-000000000000"],
    },
  };

  const [
    candidates,
    countryRows,
    cityRows,
    allBookableStudios,
  ] = await Promise.all([
    db.candidateStudio.findMany({
      where: candidateVisibility,
      include: {
        convertedStudio: { select: { status: true } },
        sources: {
          where: { active: true },
          orderBy: { collectedAt: "desc" },
          take: 2,
          select: { id: true, provider: true, providerCategory: true },
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
    db.studio.findMany({
      where: bookableBaseWhere,
      include: {
        rooms: {
          where: { active: true },
          orderBy: { hourlyRateMad: "asc" },
          take: 1,
          select: { hourlyRateMad: true },
        },
        photos: {
          orderBy: { sortOrder: "asc" },
          take: 1,
          select: { url: true },
        },
        reviews: { select: { rating: true } },
      },
      orderBy: [{ verifiedAt: "desc" }, { name: "asc" }],
      take: 5000,
    }),
  ]);

  const bookableStudios = category
    ? allBookableStudios.filter((studio) =>
        matchesCreativeCategory(
          classifyCreativeSpace({
            name: studio.name,
            storedCategory: studio.primaryCategory,
          }).key,
          category,
        ),
      )
    : allBookableStudios;

  const contactTotal = selectedClassifiedContacts.length;

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
        label: row.city + ", " + countryName(row.countryCode),
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
      if (candidate.address) value += 6;
      value += Math.min(6, candidate.sources.length * 3);
      return value;
    }
    return score(b) - score(a) || b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  const totalSpaces = contactTotal + bookableStudios.length;

  const categoryCountMap = new Map<string, number>();
  for (const entry of classifiedContacts) {
    const key = matchesCreativeCategory(entry.classification.key, "OTHER")
      ? "OTHER"
      : entry.classification.key;
    categoryCountMap.set(key, (categoryCountMap.get(key) || 0) + 1);
  }
  for (const studio of allBookableStudios) {
    const keyRaw = classifyCreativeSpace({
      name: studio.name,
      storedCategory: studio.primaryCategory,
    }).key;
    const key = matchesCreativeCategory(keyRaw, "OTHER") ? "OTHER" : keyRaw;
    categoryCountMap.set(key, (categoryCountMap.get(key) || 0) + 1);
  }

  const allSpacesCount = classifiedContacts.length + allBookableStudios.length;

  function displayCount(value: UiCategory) {
    if (!value) return allSpacesCount;
    return categoryCountMap.get(value) || 0;
  }

  const pageCount = Math.max(1, Math.ceil(contactTotal / pageSize));

  function pageHref(target: number) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (country) params.set("country", country);
    if (city) params.set("city", city);
    if (category) params.set("category", category);
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

      <section className="creative-explorer-toolbar">
        <form action="/discover" method="GET" className="creative-explorer-searchbar">
          <label className="creative-explorer-query">
            <span>⌕</span>
            <input
              name="q"
              defaultValue={q}
              placeholder="Search creative spaces..."
              autoComplete="off"
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

          {category && <input type="hidden" name="category" value={category} />}

          <button className="creative-explorer-search-button">Search</button>
        </form>

        <nav className="creative-category-strip" aria-label="Creative space categories">
          {CATEGORY_TABS.map((item) => (
            <Link
              key={item.value || "all"}
              href={categoryHref(item.value, {
                q,
                country,
                city,
                lat: radiusActive ? centerLat : null,
                lng: radiusActive ? centerLng : null,
                radiusKm: radiusActive ? radiusKm : null,
              })}
              className={
                "creative-category-chip tone-" +
                item.tone +
                (category === item.value ? " active" : "")
              }
            >
              <span>{item.icon}</span>
              <b>{item.label}</b>
              {item.value && <small>{displayCount(item.value)}</small>}
            </Link>
          ))}
        </nav>
      </section>

      <section className="creative-explorer-shell">
        <aside className="creative-explorer-list">
          <div className="creative-explorer-list-head">
            <div>
              <b>{totalSpaces.toLocaleString("en")} creative spaces</b>
              <span>
                {city
                  ? city + (country ? ", " + countryName(country) : "")
                  : country
                    ? countryName(country)
                    : "Worldwide"}
                {category ? " · " + labelCategory(category) : ""}
              </span>
            </div>
            <Link href={pageHref(1)}>Sort ↕</Link>
          </div>

          <div className="creative-explorer-cards">
            {bookableStudios.slice(0, 8).map((studio) => {
              const pointId = "bookable:" + studio.id;
              const rating = studio.reviews.length
                ? studio.reviews.reduce((sum, review) => sum + review.rating, 0) /
                  studio.reviews.length
                : null;
              const photo = studio.photos[0]?.url || null;
              return (
                <article
                  key={pointId}
                  data-directory-card
                  data-studio-id={pointId}
                  data-map-active="false"
                  className="creative-space-card"
                >
                  <Link href={"/studios/" + studio.slug} className="creative-space-card-media">
                    {photo ? (
                      <img src={photo} alt={studio.name} loading="lazy" />
                    ) : (
                      <div className="creative-space-card-fallback">
                        {categoryIcon(studio.primaryCategory)}
                      </div>
                    )}
                    <span className="creative-space-heart">♡</span>
                  </Link>

                  <div className="creative-space-card-copy">
                    <div className="creative-space-card-title">
                      <div>
                        <Link href={"/studios/" + studio.slug}>{studio.name}</Link>
                        <span>{labelCategory(studio.primaryCategory)}</span>
                      </div>
                      <button aria-label="Save studio">♡</button>
                    </div>
                    <p>{[studio.neighborhood, studio.city].filter(Boolean).join(", ")}</p>
                    <div className="creative-space-card-rating">
                      <span>★ {rating ? rating.toFixed(1) : "New"}</span>
                      {studio.reviews.length > 0 && <small>({studio.reviews.length})</small>}
                    </div>
                    <div className="creative-space-card-bottom">
                      <strong>
                        {studio.rooms[0]?.hourlyRateMad
                          ? studio.rooms[0].hourlyRateMad + " MAD"
                          : "Price on request"}{" "}
                        <small>{studio.rooms[0]?.hourlyRateMad ? "/ hour" : ""}</small>
                      </strong>
                      <span className="creative-space-status bookable">Bookable</span>
                    </div>
                    <MapFocusButton
                      studioId={pointId}
                      hasCoordinates
                      lat={Number(studio.latitude)}
                      lng={Number(studio.longitude)}
                    />
                  </div>
                </article>
              );
            })}

            {rankedCandidates.map((candidate) => {
              const pointId = "contact:" + candidate.id;
              const ownershipVerified = candidate.claims.length > 0;
              const profileV2 = ownershipVerified
                ? parseDirectoryProfileV2(candidate.transitions[0]?.metadata)
                : parseDirectoryProfileV2(null);
              const heroPhoto = profileV2.photoUrls[0] || null;
              const website = safeExternalUrl(candidate.website);
              const classification = classifyCreativeSpace({
                name: candidate.name,
                storedCategory: candidate.category,
                providerCategories: candidate.sources.map(
                  (source) => source.providerCategory,
                ),
                services: profileV2.services,
              });
              const key = classification.key;

              return (
                <article
                  key={pointId}
                  data-directory-card
                  data-studio-id={pointId}
                  data-map-active="false"
                  className="creative-space-card"
                >
                  <Link href={"/discover/" + candidate.slug} className="creative-space-card-media">
                    {heroPhoto ? (
                      <img
                        src={heroPhoto}
                        alt={candidate.name}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className={"creative-space-card-fallback category-" + String(key).toLowerCase()}>
                        {categoryIcon(key)}
                      </div>
                    )}
                  </Link>

                  <div className="creative-space-card-copy">
                    <div className="creative-space-card-title">
                      <div>
                        <Link href={"/discover/" + candidate.slug}>{candidate.name}</Link>
                        <span>{labelCategory(key)}</span>
                      </div>
                      <button aria-label="Save place">♡</button>
                    </div>

                    <p>
                      {[
                        candidate.district,
                        candidate.city,
                        candidate.countryCode ? countryName(candidate.countryCode) : null,
                      ]
                        .filter(Boolean)
                        .join(", ") || "Location available"}
                    </p>

                    <div className="creative-space-card-links">
                      {candidate.phone && (
                        <a href={cleanPhoneHref(candidate.phone)}>Call</a>
                      )}
                      {website && (
                        <a href={website} target="_blank" rel="noreferrer noopener">
                          Website ↗
                        </a>
                      )}
                    </div>

                    <div className="creative-space-card-bottom">
                      <strong>Public contact</strong>
                      <span className="creative-space-status contact">Contact only</span>
                    </div>

                    <MapFocusButton
                      studioId={pointId}
                      hasCoordinates={
                        candidate.latitude != null && candidate.longitude != null
                      }
                      lat={
                        candidate.latitude == null
                          ? null
                          : Number(candidate.latitude)
                      }
                      lng={
                        candidate.longitude == null
                          ? null
                          : Number(candidate.longitude)
                      }
                    />
                  </div>
                </article>
              );
            })}
          </div>

          {pageCount > 1 && (
            <div className="creative-explorer-pagination">
              {page > 1 ? <Link href={pageHref(page - 1)}>← Previous</Link> : <span />}
              <span>
                {page} / {pageCount}
              </span>
              {page < pageCount ? <Link href={pageHref(page + 1)}>Next →</Link> : <span />}
            </div>
          )}
        </aside>

        <section className="creative-explorer-map-pane">
          <div className="creative-explorer-map-head">
            <div>
              <b>Map</b>
              <span>Live creative-space map</span>
            </div>
            <small>
              World → country → city → category → place
            </small>
          </div>

          <CreativeExplorerMap
            filters={{
              q,
              country,
              city,
              category,
              lat: radiusActive ? centerLat : null,
              lng: radiusActive ? centerLng : null,
              radius: radiusActive ? radiusKm : null,
              north: mapBoundsActive ? north : null,
              south: mapBoundsActive ? south : null,
              east: mapBoundsActive ? east : null,
              west: mapBoundsActive ? west : null,
            }}
          />
        </section>
      </section>
    </main>
  );
}
