import { Prisma } from "@prisma/client";

import type { DiscoveryProviderStudioRecord } from "../ingest";
import { normalizeCandidateDraft } from "../normalization";
import {
  OVERTURE_ATTRIBUTION,
  OVERTURE_EXPLORER_URL,
  OVERTURE_LICENSE_URL,
  OVERTURE_PROVIDER,
} from "./overture";

type RawAddress = {
  freeform?: unknown;
  locality?: unknown;
  postcode?: unknown;
  region?: unknown;
  country?: unknown;
};

type RawTaxonomy = {
  primary?: unknown;
  hierarchy?: unknown;
  alternates?: unknown;
};

type RawSource = {
  dataset?: unknown;
  provider?: unknown;
  recordId?: unknown;
  updateTime?: unknown;
  confidence?: unknown;
};

export type OvertureGlobalContactPayload = {
  id?: unknown;
  name?: unknown;
  taxonomy?: RawTaxonomy | null;
  basicCategory?: unknown;
  confidence?: unknown;
  longitude?: unknown;
  latitude?: unknown;
  address?: RawAddress | null;
  websites?: unknown;
  socials?: unknown;
  emails?: unknown;
  phones?: unknown;
  sources?: unknown;
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
    ? value
        .filter(
          (entry): entry is string =>
            typeof entry === "string" && Boolean(entry.trim()),
        )
        .map((entry) => entry.trim())
    : [];
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
    .filter(
      (entry): entry is RawSource =>
        Boolean(entry && typeof entry === "object"),
    )
    .slice(0, 12)
    .map((entry) => ({
      dataset: text(entry.dataset),
      provider: text(entry.provider),
      recordId:
        typeof entry.recordId === "string" ||
        typeof entry.recordId === "number"
          ? String(entry.recordId)
          : null,
      updateTime: text(entry.updateTime),
      confidence: number(entry.confidence),
    }));
}

function validPhone(value: string) {
  return /^\+\d{1,3}[\s\-()0-9]+$/.test(value);
}

export function overtureGlobalContactRecord(
  raw: OvertureGlobalContactPayload,
  release: string,
): DiscoveryProviderStudioRecord | null {
  const id = text(raw.id);
  const name = text(raw.name);
  const latitude = number(raw.latitude);
  const longitude = number(raw.longitude);

  if (!id || !name || latitude == null || longitude == null) return null;

  const phoneValues = strings(raw.phones).filter(validPhone);
  if (phoneValues.length === 0) return null;

  const address = raw.address || {};
  const countryCode = text(address.country)?.toUpperCase() || null;
  const hierarchy = strings(raw.taxonomy?.hierarchy);
  const alternates = strings(raw.taxonomy?.alternates);
  const primary = text(raw.taxonomy?.primary);
  const basicCategory = text(raw.basicCategory);
  const confidence = number(raw.confidence);

  const normalized = normalizeCandidateDraft({
    name,
    providerCategory: primary || basicCategory,
    tags: {
      taxonomy: [primary, ...hierarchy, ...alternates]
        .filter(Boolean)
        .join(" "),
      basicCategory,
    },
    countryCode,
    country: countryCode,
    region: text(address.region),
    city: text(address.locality),
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
    providerCategory: primary,
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
    phone: phoneValues[0],
    email: strings(raw.emails)[0] || null,
    website: firstHttpUrl(strings(raw.websites)),
    instagram: instagramUrl(strings(raw.socials)),
    issues: [...new Set(issues)],
    slugHint: id,
    metadata: {
      release,
      overtureConfidence: confidence,
      allPublicPhones: phoneValues.slice(0, 5),
      taxonomy: {
        primary,
        hierarchy,
        alternates,
        basicCategory,
      },
      sources: providerSources(raw.sources),
    } satisfies Prisma.InputJsonValue,
  };
}
