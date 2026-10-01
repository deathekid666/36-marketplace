import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import {
  classifyCreativeSpace,
  creativeCategoryLabel,
  matchesCreativeCategory,
  type CreativeSpaceCategoryKey,
} from "@/lib/discovery/creative-classification";
import { discoveryStaleCutoff } from "@/lib/discovery/freshness";
import { directoryStudioIdentityWhere } from "@/lib/discovery/public-eligibility";
import { discoveryRolloutWhere } from "@/lib/discovery/rollout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MapPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  href: string;
  kind: "BOOKABLE" | "CONTACT";
  categoryKey: CreativeSpaceCategoryKey;
  category: string;
  countryCode: string | null;
  city: string | null;
  price: number | null;
  rating: number | null;
  photoUrl: string | null;
};

type MapNode =
  | {
      type: "country" | "city" | "category";
      id: string;
      lat: number;
      lng: number;
      count: number;
      label: string;
      categoryKey?: CreativeSpaceCategoryKey | null;
    }
  | ({
      type: "place";
    } & MapPlace);

const countryNames = new Intl.DisplayNames(["en"], { type: "region" });

function countryLabel(code: string | null) {
  if (!code) return "Unknown country";
  try {
    return countryNames.of(code) || code;
  } catch {
    return code;
  }
}

function clean(value: string | null, max = 120) {
  return String(value || "").trim().slice(0, max);
}

function numberParam(
  searchParams: URLSearchParams,
  key: string,
  min: number,
  max: number,
) {
  const parsed = Number(searchParams.get(key));
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
}

function average(group: MapPlace[]) {
  return {
    lat: group.reduce((sum, item) => sum + item.lat, 0) / group.length,
    lng: group.reduce((sum, item) => sum + item.lng, 0) / group.length,
  };
}

function inBounds(
  point: { lat: number; lng: number },
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  } | null,
) {
  if (!bounds) return true;
  return (
    point.lat <= bounds.north &&
    point.lat >= bounds.south &&
    point.lng <= bounds.east &&
    point.lng >= bounds.west
  );
}

function inferBookableCountryCode(studio: {
  city: string;
  address: string;
}) {
  const text = (studio.city + " " + studio.address)
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();

  const moroccoSignals = [
    "casablanca",
    "rabat",
    "marrakech",
    "agadir",
    "tanger",
    "tangier",
    "fes",
    "fez",
    "meknes",
    "oujda",
    "settat",
    "kenitra",
    "tetouan",
    "el jadida",
    "mohammedia",
    "morocco",
    "maroc",
  ];

  return moroccoSignals.some((signal) => text.includes(signal))
    ? "MA"
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

function response(nodes: MapNode[], meta: Record<string, unknown>) {
  return NextResponse.json(
    { nodes, meta },
    {
      headers: {
        "Cache-Control": "public, s-maxage=20, stale-while-revalidate=60",
      },
    },
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const zoom = Math.max(
    2,
    Math.min(18, Math.round(Number(params.get("zoom")) || 2)),
  );
  const q = clean(params.get("q"));
  const country = /^[A-Za-z]{2}$/.test(clean(params.get("country"), 2))
    ? clean(params.get("country"), 2).toUpperCase()
    : "";
  const city = clean(params.get("city"));
  const category = clean(params.get("category"), 40).toUpperCase();

  const appliedNorth = numberParam(params, "north", -90, 90);
  const appliedSouth = numberParam(params, "south", -90, 90);
  const appliedEast = numberParam(params, "east", -180, 180);
  const appliedWest = numberParam(params, "west", -180, 180);
  const appliedBounds =
    appliedNorth != null &&
    appliedSouth != null &&
    appliedEast != null &&
    appliedWest != null &&
    appliedNorth > appliedSouth &&
    appliedEast > appliedWest
      ? {
          north: appliedNorth,
          south: appliedSouth,
          east: appliedEast,
          west: appliedWest,
        }
      : null;

  const viewNorth = numberParam(params, "viewNorth", -90, 90);
  const viewSouth = numberParam(params, "viewSouth", -90, 90);
  const viewEast = numberParam(params, "viewEast", -180, 180);
  const viewWest = numberParam(params, "viewWest", -180, 180);
  const viewport =
    zoom >= 8 &&
    viewNorth != null &&
    viewSouth != null &&
    viewEast != null &&
    viewWest != null &&
    viewNorth > viewSouth &&
    viewEast > viewWest
      ? {
          north: viewNorth,
          south: viewSouth,
          east: viewEast,
          west: viewWest,
        }
      : null;

  const centerLat = numberParam(params, "lat", -90, 90);
  const centerLng = numberParam(params, "lng", -180, 180);
  const radiusRaw = Number(params.get("radius"));
  const radiusKm = [5, 10, 25, 50, 100].includes(radiusRaw)
    ? radiusRaw
    : null;

  const staleCutoff = discoveryStaleCutoff();

  const candidateAnd: Prisma.CandidateStudioWhereInput[] = [
    discoveryRolloutWhere("PUBLIC_DISCOVERY"),
    { phone: { not: null } },
    { latitude: { not: null } },
    { longitude: { not: null } },
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
  ];

  if (q) {
    candidateAnd.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { normalizedName: { contains: q, mode: "insensitive" } },
        { city: { contains: q, mode: "insensitive" } },
        { district: { contains: q, mode: "insensitive" } },
        { country: { contains: q, mode: "insensitive" } },
      ],
    });
  }

  if (country) candidateAnd.push({ countryCode: country });
  if (city) {
    candidateAnd.push({
      city: { contains: city, mode: "insensitive" },
    });
  }
  if (appliedBounds) {
    candidateAnd.push(
      {
        latitude: {
          gte: appliedBounds.south,
          lte: appliedBounds.north,
        },
      },
      {
        longitude: {
          gte: appliedBounds.west,
          lte: appliedBounds.east,
        },
      },
    );
  }

  const [candidateRows, studioRows] = await Promise.all([
    db.candidateStudio.findMany({
      where: { AND: candidateAnd },
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
    }),
    db.studio.findMany({
      where: {
        status: "VERIFIED",
        latitude: { not: null },
        longitude: { not: null },
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { city: { contains: q, mode: "insensitive" } },
                { neighborhood: { contains: q, mode: "insensitive" } },
                { address: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(city
          ? { city: { contains: city, mode: "insensitive" } }
          : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        primaryCategory: true,
        latitude: true,
        longitude: true,
        city: true,
        address: true,
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
    }),
  ]);

  const contactPlaces: MapPlace[] = candidateRows
    .filter((candidate) => candidate.convertedStudio?.status !== "VERIFIED")
    .map((candidate) => {
      const classification = classifyCreativeSpace({
        name: candidate.name,
        storedCategory: candidate.category,
        providerCategories: candidate.sources.map(
          (source) => source.providerCategory,
        ),
      });

      return {
        id: "contact:" + candidate.id,
        name: candidate.name,
        lat: Number(candidate.latitude),
        lng: Number(candidate.longitude),
        href: "/discover/" + candidate.slug,
        kind: "CONTACT" as const,
        categoryKey: classification.key,
        category: creativeCategoryLabel(classification.key),
        countryCode: candidate.countryCode,
        city: candidate.city,
        price: null,
        rating: null,
        photoUrl: null,
      };
    })
    .filter((place) =>
      category
        ? matchesCreativeCategory(place.categoryKey, category)
        : true,
    );

  const bookablePlaces: MapPlace[] = studioRows
    .map((studio) => {
      const classification = classifyCreativeSpace({
        name: studio.name,
        storedCategory: studio.primaryCategory,
      });
      const rating = studio.reviews.length
        ? studio.reviews.reduce((sum, review) => sum + review.rating, 0) /
          studio.reviews.length
        : null;

      return {
        id: "bookable:" + studio.id,
        name: studio.name,
        lat: Number(studio.latitude),
        lng: Number(studio.longitude),
        href: "/studios/" + studio.slug,
        kind: "BOOKABLE" as const,
        categoryKey: classification.key,
        category: creativeCategoryLabel(classification.key),
        countryCode: inferBookableCountryCode(studio),
        city: studio.city,
        price: studio.rooms[0]?.hourlyRateMad || null,
        rating,
        photoUrl: studio.photos[0]?.url || null,
      };
    })
    .filter((place) => {
      if (country && place.countryCode !== country) return false;
      if (
        category &&
        !matchesCreativeCategory(place.categoryKey, category)
      ) {
        return false;
      }
      return inBounds(place, appliedBounds);
    });

  let places = [...bookablePlaces, ...contactPlaces];

  if (
    radiusKm != null &&
    centerLat != null &&
    centerLng != null
  ) {
    places = places.filter(
      (place) =>
        haversineKm(
          centerLat,
          centerLng,
          place.lat,
          place.lng,
        ) <= radiusKm,
    );
  }

  const matchedMapped = places.length;
  const unknownCountryCount = places.filter(
    (place) => !place.countryCode,
  ).length;

  const visiblePlaces = viewport
    ? places.filter((place) => inBounds(place, viewport))
    : places;

  if (zoom <= 4) {
    const groups = new Map<string, MapPlace[]>();
    for (const place of places) {
      const key = place.countryCode || "UNKNOWN";
      groups.set(key, [...(groups.get(key) || []), place]);
    }

    const nodes: MapNode[] = [...groups.entries()].map(
      ([code, group]) => {
        const center = average(group);
        return {
          type: "country" as const,
          id: "country:" + code,
          lat: center.lat,
          lng: center.lng,
          count: group.length,
          label:
            code === "UNKNOWN"
              ? "Unknown country"
              : countryLabel(code),
        };
      },
    );

    return response(nodes, {
      level: "country",
      matchedMapped,
      renderedNodes: nodes.length,
      unknownCountryCount,
      contactCount: contactPlaces.length,
      bookableCount: bookablePlaces.length,
    });
  }

  if (zoom <= 7) {
    const groups = new Map<string, MapPlace[]>();
    for (const place of places) {
      const countryKey = place.countryCode || "UNKNOWN";
      const cityKey = clean(place.city, 120) || "Other";
      const key = countryKey + "::" + cityKey;
      groups.set(key, [...(groups.get(key) || []), place]);
    }

    const nodes: MapNode[] = [...groups.entries()].map(
      ([key, group]) => {
        const center = average(group);
        const cityLabel = key.split("::").slice(1).join("::");
        return {
          type: "city" as const,
          id: "city:" + key,
          lat: center.lat,
          lng: center.lng,
          count: group.length,
          label: cityLabel,
        };
      },
    );

    return response(nodes, {
      level: "city",
      matchedMapped,
      renderedNodes: nodes.length,
      unknownCountryCount,
      contactCount: contactPlaces.length,
      bookableCount: bookablePlaces.length,
    });
  }

  if (zoom <= 11) {
    const groups = new Map<string, MapPlace[]>();
    for (const place of visiblePlaces) {
      const countryKey = place.countryCode || "UNKNOWN";
      const cityKey = clean(place.city, 120) || "Other";
      const key =
        countryKey +
        "::" +
        cityKey +
        "::" +
        place.categoryKey;
      groups.set(key, [...(groups.get(key) || []), place]);
    }

    const nodes: MapNode[] = [...groups.entries()].map(
      ([key, group]) => {
        const center = average(group);
        const categoryKey = group[0].categoryKey;
        return {
          type: "category" as const,
          id: "category:" + key,
          lat: center.lat,
          lng: center.lng,
          count: group.length,
          label: group[0].category,
          categoryKey,
        };
      },
    );

    return response(nodes, {
      level: "category",
      matchedMapped,
      renderedNodes: nodes.length,
      unknownCountryCount,
      contactCount: contactPlaces.length,
      bookableCount: bookablePlaces.length,
    });
  }

  const nodes: MapNode[] = visiblePlaces.map((place) => ({
    type: "place" as const,
    ...place,
  }));

  return response(nodes, {
    level: "place",
    matchedMapped,
    renderedNodes: nodes.length,
    unknownCountryCount,
    contactCount: contactPlaces.length,
    bookableCount: bookablePlaces.length,
  });
}
