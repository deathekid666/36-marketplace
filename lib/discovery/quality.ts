import {
  discoveryFreshness,
  type DiscoveryFreshness,
} from "@/lib/discovery/freshness";

export type DiscoveryQualityBand = "STRONG" | "REVIEW" | "WEAK";

export type DiscoveryQualityInput = {
  name: string;
  normalizedName: string;
  category: string;
  countryCode: string | null;
  city: string | null;
  address: string | null;
  latitude: unknown | null;
  longitude: unknown | null;
  phone: string | null;
  website: string | null;
  activeSourceCount: number;
  lastCheckedAt: Date | string | null;
};

export type DiscoveryQualityAssessment = {
  score: number;
  band: DiscoveryQualityBand;
  freshness: DiscoveryFreshness;
  blockers: string[];
  positives: string[];
};

export function assessDiscoveryQuality(
  input: DiscoveryQualityInput,
): DiscoveryQualityAssessment {
  let score = 0;
  const blockers: string[] = [];
  const positives: string[] = [];

  const identityReady =
    input.name.trim().length >= 2 && input.normalizedName.trim().length >= 2;
  if (identityReady) {
    score += 20;
    positives.push("Identity is normalized");
  } else {
    blockers.push("Identity is incomplete");
  }

  if (input.category && input.category !== "OTHER") {
    score += 15;
    positives.push("Studio category is resolved");
  } else {
    blockers.push("Studio category is unresolved");
  }

  if (input.countryCode && /^[A-Z]{2}$/.test(input.countryCode)) {
    score += 10;
    positives.push("Country code is resolved");
  } else {
    blockers.push("Country code is unresolved");
  }

  const hasCoordinates = input.latitude != null && input.longitude != null;
  const hasLocation = Boolean(input.city?.trim() || input.address?.trim() || hasCoordinates);
  if (hasLocation) {
    score += 15;
    positives.push("Location evidence is present");
  } else {
    blockers.push("Location evidence is missing");
  }

  if (input.activeSourceCount >= 2) {
    score += 20;
    positives.push("Multiple active provider sources");
  } else if (input.activeSourceCount === 1) {
    score += 12;
    positives.push("One active provider source");
  } else {
    blockers.push("No active provider source");
  }

  if (input.website?.trim()) {
    score += 8;
    positives.push("Public website is available");
  }

  if (input.phone?.trim()) {
    score += 5;
    positives.push("Public phone is available");
  }

  const freshness = discoveryFreshness(input.lastCheckedAt);
  if (freshness === "FRESH") {
    score += 7;
    positives.push("Provider evidence is fresh");
  } else if (freshness === "AGING") {
    score += 3;
    positives.push("Provider evidence is aging but still public");
  } else if (freshness === "STALE") {
    blockers.push("Provider evidence is stale");
  } else {
    blockers.push("Provider evidence has never been checked");
  }

  score = Math.max(0, Math.min(100, score));

  const band: DiscoveryQualityBand =
    blockers.length === 0 && score >= 75
      ? "STRONG"
      : score >= 50
        ? "REVIEW"
        : "WEAK";

  return { score, band, freshness, blockers, positives };
}

export function discoveryQualityClass(band: DiscoveryQualityBand) {
  switch (band) {
    case "STRONG":
      return "border-emerald-900/50 text-emerald-300";
    case "REVIEW":
      return "border-amber-900/50 text-amber-300";
    case "WEAK":
      return "border-red-900/50 text-red-300";
  }
}
