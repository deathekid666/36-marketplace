import { Prisma } from "@prisma/client";

import snapshot from "@/data/discovery/overture/casablanca.json";
import type { DiscoveryProviderStudioRecord } from "@/lib/discovery/ingest";
import { normalizeCandidateDraft } from "@/lib/discovery/normalization";

export const OVERTURE_PROVIDER = "OVERTURE";
export const OVERTURE_ATTRIBUTION = "Overture Maps Foundation";
export const OVERTURE_LICENSE_URL = "https://docs.overturemaps.org/attribution/";
export const OVERTURE_EXPLORER_URL = "https://explore.overturemaps.org/";

type SnapshotAddress = {
  freeform?: unknown;
  locality?: unknown;
  postcode?: unknown;
  region?: unknown;
  country?: unknown;
};

type SnapshotTaxonomy = {
  primary?: unknown;
  hierarchy?: unknown;
  alternates?: unknown;
  basicCategory?: unknown;
};

type SnapshotSource = {
  dataset?: unknown;
  provider?: unknown;
  recordId?: unknown;
  updateTime?: unknown;
  confidence?: unknown;
};

type SnapshotRecord = {
  id?: unknown;
  name?: unknown;
  taxonomy?: SnapshotTaxonomy | null;
  confidence?: unknown;
  longitude?: unknown;
  latitude?: unknown;
  address?: SnapshotAddress | null;
  websites?: unknown;
  socials?: unknown;
  emails?: unknown;
  phones?: unknown;
  sources?: unknown;
};

type SnapshotShape = {
  provider?: unknown;
  release?: unknown;
  generatedAt?: unknown;
  totalPlacesInBbox?: unknown;
  records?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    : [];
}

function taxonomyStrings(taxonomy: SnapshotTaxonomy | null | undefined) {
  return [
    text(taxonomy?.primary),
    text(taxonomy?.basicCategory),
    ...strings(taxonomy?.hierarchy),
    ...strings(taxonomy?.alternates),
  ].filter((entry): entry is string => Boolean(entry));
}

function firstHttpUrl(values: string[]) {
  for (const value of values) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") {
        return parsed.toString();
      }
    } catch {
      // Ignore malformed provider values.
    }
  }

  return null;
}

function instagramUrl(values: string[]) {
  return (
    values.find((value) => {
      try {
        const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "");
        return host === "instagram.com" || host.endsWith(".instagram.com");
      } catch {
        return false;
      }
    }) || null
  );
}

function providerSources(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .filter((entry): entry is SnapshotSource => Boolean(entry && typeof entry === "object"))
    .slice(0, 12)
    .map((entry) => ({
      dataset: text(entry.dataset),
      provider: text(entry.provider),
      recordId:
        typeof entry.recordId === "string" || typeof entry.recordId === "number"
          ? String(entry.recordId)
          : null,
      updateTime: text(entry.updateTime),
      confidence: number(entry.confidence),
    }));
}

function recordFromSnapshot(
  record: SnapshotRecord,
  generatedAt: string,
): DiscoveryProviderStudioRecord | null {
  const id = text(record.id);
  const name = text(record.name);
  const latitude = number(record.latitude);
  const longitude = number(record.longitude);

  if (!id || !name || latitude == null || longitude == null) return null;

  const address = record.address || {};
  const countryCode = text(address.country)?.toUpperCase() || "MA";
  const taxonomy = taxonomyStrings(record.taxonomy);
  const primaryTaxonomy = text(record.taxonomy?.primary);
  const socialValues = strings(record.socials);
  const confidence = number(record.confidence);

  const normalized = normalizeCandidateDraft({
    name,
    providerCategory: primaryTaxonomy || taxonomy[0] || null,
    tags: {
      taxonomy: taxonomy.join(" "),
      basicCategory: text(record.taxonomy?.basicCategory),
    },
    countryCode,
    country: countryCode === "MA" ? "Morocco" : null,
    region: text(address.region),
    city: "Casablanca",
    district: null,
    postalCode: text(address.postcode),
    address: text(address.freeform),
    latitude,
    longitude,
  });

  const issues = [...normalized.issues];
  if (confidence != null && confidence < 0.45) {
    issues.push("PROVIDER_LOW_CONFIDENCE");
  }

  return {
    provider: OVERTURE_PROVIDER,
    sourceKey: `overture:${id}`,
    externalId: id,
    sourceUrl: OVERTURE_EXPLORER_URL,
    providerCategory: primaryTaxonomy,
    attribution: OVERTURE_ATTRIBUTION,
    licenseUrl: OVERTURE_LICENSE_URL,
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
    phone: strings(record.phones)[0] || null,
    email: strings(record.emails)[0] || null,
    website: firstHttpUrl(strings(record.websites)),
    instagram: instagramUrl(socialValues),
    issues: [...new Set(issues)],
    slugHint: id,
    metadata: {
      overtureConfidence: confidence,
      taxonomy: {
        primary: primaryTaxonomy,
        values: taxonomy,
      },
      socials: socialValues,
      sources: providerSources(record.sources),
      snapshotGeneratedAt: generatedAt,
    } satisfies Prisma.InputJsonValue,
  };
}

export function getOvertureSnapshotInfo() {
  const data = snapshot as SnapshotShape;
  return {
    generatedAt: text(data.generatedAt),
    totalPlacesInBbox: number(data.totalPlacesInBbox) || 0,
    recordCount: Array.isArray(data.records) ? data.records.length : 0,
  };
}

export function loadOvertureSnapshot(): {
  generatedAt: string;
  records: DiscoveryProviderStudioRecord[];
} {
  const data = snapshot as SnapshotShape;
  const generatedAt = text(data.generatedAt);

  if (!generatedAt || !Array.isArray(data.records)) {
    throw new Error("OVERTURE_SNAPSHOT_NOT_READY");
  }

  const records = data.records
    .map((record) =>
      record && typeof record === "object"
        ? recordFromSnapshot(record as SnapshotRecord, generatedAt)
        : null,
    )
    .filter((record): record is DiscoveryProviderStudioRecord => Boolean(record));

  if (records.length === 0) {
    throw new Error("OVERTURE_SNAPSHOT_EMPTY");
  }

  return { generatedAt, records };
}
