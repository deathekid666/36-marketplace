import { DiscoveryStudioCategory } from "@prisma/client";

export type CategoryConfidence = "HIGH" | "MEDIUM" | "LOW";

export type CategoryNormalizationInput = {
  name?: string | null;
  providerCategory?: string | null;
  tags?: Record<string, string | null | undefined> | null;
};

export type CategoryNormalizationResult = {
  category: DiscoveryStudioCategory;
  confidence: CategoryConfidence;
  evidence: string[];
  alternatives: DiscoveryStudioCategory[];
  issues: string[];
};

export type GeographyNormalizationInput = {
  countryCode?: string | null;
  country?: string | null;
  region?: string | null;
  city?: string | null;
  district?: string | null;
  postalCode?: string | number | null;
  address?: string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
};

export type GeographyNormalizationResult = {
  countryCode: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  issues: string[];
};

export type CandidateNormalizationInput = CategoryNormalizationInput &
  GeographyNormalizationInput & {
    name: string;
  };

export type CandidateNormalizationResult = {
  name: string;
  normalizedName: string;
  category: DiscoveryStudioCategory;
  categoryConfidence: CategoryConfidence;
  categoryEvidence: string[];
  categoryAlternatives: DiscoveryStudioCategory[];
  countryCode: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  issues: string[];
};

type CategoryRule = {
  category: DiscoveryStudioCategory;
  phrases: readonly string[];
  specificity: number;
};

const CATEGORY_RULES: readonly CategoryRule[] = [
  {
    category: DiscoveryStudioCategory.PODCAST,
    phrases: ["podcast", "podcasting"],
    specificity: 60,
  },
  {
    category: DiscoveryStudioCategory.VOICE_OVER,
    phrases: ["voice over", "voiceover", "voice-over", "dubbing", "narration studio"],
    specificity: 60,
  },
  {
    category: DiscoveryStudioCategory.LIVE_STREAMING,
    phrases: ["live streaming", "livestream", "live stream", "streaming studio"],
    specificity: 60,
  },
  {
    category: DiscoveryStudioCategory.POST_PRODUCTION,
    phrases: ["post production", "post-production", "postproduction", "color grading", "video editing"],
    specificity: 55,
  },
  {
    category: DiscoveryStudioCategory.REHEARSAL,
    phrases: ["rehearsal", "practice room", "band practice", "music rehearsal"],
    specificity: 50,
  },
  {
    category: DiscoveryStudioCategory.PHOTO,
    phrases: ["photography", "photo studio", "photographic studio"],
    specificity: 48,
  },
  {
    category: DiscoveryStudioCategory.VIDEO,
    phrases: ["video studio", "film studio", "television studio", "tv studio", "video production"],
    specificity: 46,
  },
  {
    category: DiscoveryStudioCategory.DJ,
    phrases: ["dj studio", "deejay studio", "dj rehearsal"],
    specificity: 46,
  },
  {
    category: DiscoveryStudioCategory.PRODUCTION,
    phrases: ["music production", "production studio", "beatmaking", "beat making", "producer studio"],
    specificity: 42,
  },
  {
    category: DiscoveryStudioCategory.RECORDING,
    phrases: [
      "recording studio",
      "audio recording",
      "sound recording",
      "studio audio",
      "audio studio",
      "music recording",
      "radio studio",
      "recording",
    ],
    specificity: 38,
  },
] as const;

function displayText(value: string | null | undefined) {
  if (value == null) return null;
  const cleaned = value.normalize("NFC").replace(/\s+/g, " ").trim();
  return cleaned || null;
}

export function normalizeSearchText(value: string | null | undefined) {
  if (!value) return "";
  return value
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en")
    .replace(/[’'\u2018\u2019]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function categorySources(input: CategoryNormalizationInput) {
  const rows: Array<{ label: string; text: string; weight: number }> = [];

  const providerCategory = normalizeSearchText(input.providerCategory);
  if (providerCategory) {
    rows.push({ label: "providerCategory", text: providerCategory, weight: 100 });
  }

  if (input.tags) {
    for (const [key, rawValue] of Object.entries(input.tags)) {
      const value = normalizeSearchText(rawValue || "");
      const normalizedKey = normalizeSearchText(key);
      const joined = [normalizedKey, value].filter(Boolean).join(" ");
      if (joined) {
        rows.push({ label: `tag:${key}`, text: joined, weight: 80 });
      }
    }
  }

  const name = normalizeSearchText(input.name);
  if (name) {
    rows.push({ label: "name", text: name, weight: 30 });
  }

  return rows;
}

export function normalizeStudioCategory(
  input: CategoryNormalizationInput,
): CategoryNormalizationResult {
  const scores = new Map<DiscoveryStudioCategory, number>();
  const evidence = new Map<DiscoveryStudioCategory, string[]>();

  for (const source of categorySources(input)) {
    for (const rule of CATEGORY_RULES) {
      for (const rawPhrase of rule.phrases) {
        const phrase = normalizeSearchText(rawPhrase);
        if (!phrase || !source.text.includes(phrase)) continue;

        const score = source.weight + rule.specificity + Math.min(phrase.length, 24);
        const previous = scores.get(rule.category) || 0;
        if (score > previous) scores.set(rule.category, score);

        const list = evidence.get(rule.category) || [];
        const marker = `${source.label}:${rawPhrase}`;
        if (!list.includes(marker)) list.push(marker);
        evidence.set(rule.category, list);
      }
    }
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (ranked.length === 0) {
    return {
      category: DiscoveryStudioCategory.OTHER,
      confidence: "LOW",
      evidence: [],
      alternatives: [],
      issues: ["CATEGORY_UNRESOLVED"],
    };
  }

  const [bestCategory, bestScore] = ranked[0];
  const second = ranked[1];

  if (second && bestScore === second[1]) {
    return {
      category: DiscoveryStudioCategory.OTHER,
      confidence: "LOW",
      evidence: [
        ...(evidence.get(bestCategory) || []),
        ...(evidence.get(second[0]) || []),
      ],
      alternatives: ranked.filter(([, score]) => score === bestScore).map(([category]) => category),
      issues: ["CATEGORY_AMBIGUOUS"],
    };
  }

  const confidence: CategoryConfidence =
    bestScore >= 150 ? "HIGH" : bestScore >= 100 ? "MEDIUM" : "LOW";

  return {
    category: bestCategory,
    confidence,
    evidence: evidence.get(bestCategory) || [],
    alternatives: ranked.slice(1, 4).map(([category]) => category),
    issues: confidence === "LOW" ? ["CATEGORY_LOW_CONFIDENCE"] : [],
  };
}

function normalizeCountryCode(value: string | null | undefined) {
  if (!value) return { value: null, issue: null as string | null };

  const code = value.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    return { value: null, issue: "COUNTRY_CODE_INVALID" };
  }

  return { value: code, issue: null as string | null };
}

function numericCoordinate(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  const number = typeof value === "number" ? value : Number(value.trim());
  return Number.isFinite(number) ? number : Number.NaN;
}

function roundCoordinate(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function normalizeGeography(
  input: GeographyNormalizationInput,
): GeographyNormalizationResult {
  const issues: string[] = [];
  const countryCode = normalizeCountryCode(input.countryCode);
  if (countryCode.issue) issues.push(countryCode.issue);

  const rawLatitude = numericCoordinate(input.latitude);
  const rawLongitude = numericCoordinate(input.longitude);

  let latitude: number | null = null;
  let longitude: number | null = null;

  const latitudeProvided = rawLatitude != null;
  const longitudeProvided = rawLongitude != null;

  if (latitudeProvided !== longitudeProvided) {
    issues.push("COORDINATES_PARTIAL");
  } else if (latitudeProvided && longitudeProvided) {
    const latitudeValid = Number.isFinite(rawLatitude) && rawLatitude! >= -90 && rawLatitude! <= 90;
    const longitudeValid =
      Number.isFinite(rawLongitude) && rawLongitude! >= -180 && rawLongitude! <= 180;

    if (!latitudeValid) issues.push("LATITUDE_INVALID");
    if (!longitudeValid) issues.push("LONGITUDE_INVALID");

    if (latitudeValid && longitudeValid) {
      latitude = roundCoordinate(rawLatitude!);
      longitude = roundCoordinate(rawLongitude!);
    }
  }

  const postalCode =
    input.postalCode == null ? null : displayText(String(input.postalCode));

  return {
    countryCode: countryCode.value,
    country: displayText(input.country),
    region: displayText(input.region),
    city: displayText(input.city),
    district: displayText(input.district),
    postalCode,
    address: displayText(input.address),
    latitude,
    longitude,
    issues,
  };
}

export function normalizeCandidateDraft(
  input: CandidateNormalizationInput,
): CandidateNormalizationResult {
  const name = displayText(input.name);
  if (!name) throw new Error("CANDIDATE_NAME_REQUIRED");

  const normalizedName = normalizeSearchText(name);
  if (!normalizedName) throw new Error("CANDIDATE_NORMALIZED_NAME_REQUIRED");

  const category = normalizeStudioCategory(input);
  const geography = normalizeGeography(input);

  return {
    name,
    normalizedName,
    category: category.category,
    categoryConfidence: category.confidence,
    categoryEvidence: category.evidence,
    categoryAlternatives: category.alternatives,
    countryCode: geography.countryCode,
    country: geography.country,
    region: geography.region,
    city: geography.city,
    district: geography.district,
    postalCode: geography.postalCode,
    address: geography.address,
    latitude: geography.latitude,
    longitude: geography.longitude,
    issues: [...category.issues, ...geography.issues],
  };
}
