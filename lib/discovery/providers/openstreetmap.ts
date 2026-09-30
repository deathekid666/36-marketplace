import { normalizeCandidateDraft } from "../normalization";

export const OPENSTREETMAP_PROVIDER = "OPENSTREETMAP";
export const OPENSTREETMAP_ATTRIBUTION = "© OpenStreetMap contributors";
export const OPENSTREETMAP_LICENSE_URL = "https://www.openstreetmap.org/copyright";
export const DEFAULT_OVERPASS_API_URL = "https://overpass.private.coffee/api/interpreter";

export type DiscoveryBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type DiscoveryScanContext = {
  key: string;
  label: string;
  countryCode: string;
  country: string;
  city: string;
  bounds: DiscoveryBounds;
};

export const OSM_SCAN_PRESETS: Record<string, DiscoveryScanContext> = {
  CASABLANCA: {
    key: "CASABLANCA",
    label: "Casablanca pilot",
    countryCode: "MA",
    country: "Morocco",
    city: "Casablanca",
    bounds: {
      south: 33.45,
      west: -7.75,
      north: 33.70,
      east: -7.45,
    },
  },
};

type OverpassElement = {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: { lat?: unknown; lon?: unknown } | null;
  tags?: Record<string, unknown> | null;
  timestamp?: unknown;
};

type OverpassResponse = {
  elements?: unknown;
};

export type OpenStreetMapStudioRecord = {
  provider: typeof OPENSTREETMAP_PROVIDER;
  sourceKey: string;
  externalId: string;
  sourceUrl: string;
  providerCategory: string;
  attribution: string;
  licenseUrl: string;
  osmType: "node" | "way" | "relation";
  osmId: number;
  osmTimestamp: string | null;
  tags: Record<string, string>;
  name: string;
  normalizedName: string;
  category: ReturnType<typeof normalizeCandidateDraft>["category"];
  categoryConfidence: ReturnType<typeof normalizeCandidateDraft>["categoryConfidence"];
  categoryEvidence: string[];
  categoryAlternatives: ReturnType<typeof normalizeCandidateDraft>["categoryAlternatives"];
  countryCode: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  issues: string[];
};

export type OpenStreetMapScanResult = {
  endpoint: string;
  context: DiscoveryScanContext;
  fetchedAt: string;
  records: OpenStreetMapStudioRecord[];
  skippedWithoutName: number;
  rawElementCount: number;
};

function textTag(tags: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const value = tags[key]?.trim();
    if (value) return value;
  }
  return null;
}

function stringTags(raw: Record<string, unknown> | null | undefined) {
  const result: Record<string, string> = {};
  if (!raw) return result;

  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.trim()) {
      result[key] = value.trim();
    }
  }

  return result;
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function addressFromTags(tags: Record<string, string>) {
  const full = textTag(tags, "addr:full");
  if (full) return full;

  const number = textTag(tags, "addr:housenumber");
  const street = textTag(tags, "addr:street", "addr:place");
  const line = [number, street].filter(Boolean).join(" ").trim();
  return line || null;
}

function providerCategoryFromTags(tags: Record<string, string>) {
  if (tags.shop === "photo_studio") return "Photography Studio";

  const studioType = tags.studio?.trim().toLowerCase();
  if (studioType === "audio") return "Recording Studio";
  if (studioType === "video") return "Video Studio";
  if (studioType === "television") return "Television Video Studio";
  if (studioType === "radio") return "Radio Studio";
  if (studioType === "podcast") return "Podcast Studio";
  if (studioType === "photo" || studioType === "photography") return "Photo Studio";

  if (tags.amenity === "studio" && tags.studio) {
    return `amenity=studio; studio=${tags.studio}`;
  }
  if (tags.amenity === "studio") return "amenity=studio";
  if (tags.studio) return `studio=${tags.studio}`;
  return "studio";
}

function osmType(value: unknown): "node" | "way" | "relation" | null {
  return value === "node" || value === "way" || value === "relation" ? value : null;
}

export function buildOpenStreetMapStudioQuery(bounds: DiscoveryBounds) {
  const { south, west, north, east } = bounds;
  const values = [south, west, north, east];

  if (!values.every(Number.isFinite)) throw new Error("OSM_BOUNDS_INVALID");
  if (south >= north || west >= east) throw new Error("OSM_BOUNDS_INVALID");
  if (south < -90 || north > 90 || west < -180 || east > 180) {
    throw new Error("OSM_BOUNDS_INVALID");
  }

  const latSpan = north - south;
  const lonSpan = east - west;
  if (latSpan > 1 || lonSpan > 1) throw new Error("OSM_BOUNDS_TOO_LARGE");

  const bbox = `${south},${west},${north},${east}`;

  return [
    "[out:json][timeout:20][maxsize:20000000];",
    "(",
    `  nwr["amenity"="studio"](${bbox});`,
    `  nwr["shop"="photo_studio"](${bbox});`,
    ");",
    "out center tags;",
  ].join("\n");
}

export function parseOpenStreetMapStudioResponse(
  payload: unknown,
  context: DiscoveryScanContext,
): {
  records: OpenStreetMapStudioRecord[];
  skippedWithoutName: number;
  rawElementCount: number;
} {
  if (!payload || typeof payload !== "object") throw new Error("OSM_RESPONSE_INVALID");

  const response = payload as OverpassResponse;
  if (!Array.isArray(response.elements)) throw new Error("OSM_RESPONSE_INVALID");

  const records: OpenStreetMapStudioRecord[] = [];
  let skippedWithoutName = 0;

  for (const rawElement of response.elements) {
    if (!rawElement || typeof rawElement !== "object") continue;

    const element = rawElement as OverpassElement;
    const type = osmType(element.type);
    const id = finiteNumber(element.id);
    if (!type || id == null || !Number.isInteger(id) || id <= 0) continue;

    const tags = stringTags(element.tags);
    const name = textTag(tags, "name", "brand", "operator");
    if (!name) {
      skippedWithoutName += 1;
      continue;
    }

    const latitude =
      finiteNumber(element.lat) ?? finiteNumber(element.center?.lat);
    const longitude =
      finiteNumber(element.lon) ?? finiteNumber(element.center?.lon);

    const providerCategory = providerCategoryFromTags(tags);

    const normalized = normalizeCandidateDraft({
      name,
      providerCategory,
      tags,
      countryCode: textTag(tags, "addr:country") || context.countryCode,
      country: context.country,
      region: textTag(tags, "addr:state", "addr:province", "addr:region"),
      city: textTag(tags, "addr:city", "addr:town", "addr:village") || context.city,
      district: textTag(
        tags,
        "addr:suburb",
        "addr:district",
        "addr:quarter",
        "addr:neighbourhood",
      ),
      postalCode: textTag(tags, "addr:postcode"),
      address: addressFromTags(tags),
      latitude,
      longitude,
    });

    const externalId = `${type}/${id}`;

    records.push({
      provider: OPENSTREETMAP_PROVIDER,
      sourceKey: `osm:${type}:${id}`,
      externalId,
      sourceUrl: `https://www.openstreetmap.org/${externalId}`,
      providerCategory,
      attribution: OPENSTREETMAP_ATTRIBUTION,
      licenseUrl: OPENSTREETMAP_LICENSE_URL,
      osmType: type,
      osmId: id,
      osmTimestamp: typeof element.timestamp === "string" ? element.timestamp : null,
      tags,
      name: normalized.name,
      normalizedName: normalized.normalizedName,
      category: normalized.category,
      categoryConfidence: normalized.categoryConfidence,
      categoryEvidence: normalized.categoryEvidence,
      categoryAlternatives: normalized.categoryAlternatives,
      countryCode: normalized.countryCode,
      country: normalized.country,
      region: normalized.region,
      city: normalized.city,
      district: normalized.district,
      postalCode: normalized.postalCode,
      address: normalized.address,
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      phone: textTag(tags, "contact:phone", "phone"),
      email: textTag(tags, "contact:email", "email"),
      website: textTag(tags, "contact:website", "website", "url"),
      instagram: textTag(tags, "contact:instagram", "instagram"),
      issues: normalized.issues,
    });
  }

  return {
    records,
    skippedWithoutName,
    rawElementCount: response.elements.length,
  };
}

export async function fetchOpenStreetMapStudios(
  context: DiscoveryScanContext,
): Promise<OpenStreetMapScanResult> {
  const endpoint = process.env.OVERPASS_API_URL?.trim() || DEFAULT_OVERPASS_API_URL;
  let url: URL;

  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("OSM_ENDPOINT_INVALID");
  }

  if (url.protocol !== "https:") throw new Error("OSM_ENDPOINT_MUST_BE_HTTPS");

  const query = buildOpenStreetMapStudioQuery(context.bounds);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22_000);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/json",
        "User-Agent": "36-marketplace/0.1 (+https://36-marketplace.vercel.app)",
        Referer: "https://36-marketplace.vercel.app/admin/discovery",
      },
      body: new URLSearchParams({ data: query }),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("OSM_REQUEST_TIMEOUT");
    }
    throw new Error("OSM_REQUEST_FAILED");
  } finally {
    clearTimeout(timeout);
  }

  if (response.status === 429 || response.status === 406) {
    throw new Error("OSM_RATE_LIMITED");
  }
  if (!response.ok) {
    throw new Error(`OSM_HTTP_${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") || "0");
  if (contentLength > 5_000_000) throw new Error("OSM_RESPONSE_TOO_LARGE");

  const body = await response.text();
  if (body.length > 5_000_000) throw new Error("OSM_RESPONSE_TOO_LARGE");

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error("OSM_RESPONSE_INVALID_JSON");
  }

  const parsed = parseOpenStreetMapStudioResponse(payload, context);

  if (parsed.records.length > 250) {
    throw new Error("OSM_RESULT_SET_TOO_LARGE");
  }

  return {
    endpoint: url.toString(),
    context,
    fetchedAt: new Date().toISOString(),
    ...parsed,
  };
}
