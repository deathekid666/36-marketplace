import { DiscoveryStudioCategory } from "@prisma/client";

import { normalizeSearchText } from "./normalization";

export type DedupDecision = "AUTO_MATCH" | "REVIEW" | "DISTINCT";

export type DedupCandidate = {
  id?: string | null;
  name: string;
  normalizedName?: string | null;
  category?: DiscoveryStudioCategory | null;
  countryCode?: string | null;
  city?: string | null;
  district?: string | null;
  postalCode?: string | null;
  address?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  phone?: string | null;
  website?: string | null;
  instagram?: string | null;
};

export type DedupEvaluation = {
  decision: DedupDecision;
  score: number;
  reasons: string[];
  conflicts: string[];
  strongIdentityMatches: number;
  nameSimilarity: number;
  addressSimilarity: number;
  distanceMeters: number | null;
};

export type DedupSelection = {
  decision: DedupDecision;
  candidateId: string | null;
  evaluation: DedupEvaluation | null;
  ambiguousCandidateIds: string[];
};

const GENERIC_NAME_TOKENS = new Set([
  "studio",
  "studios",
  "recording",
  "records",
  "record",
  "audio",
  "music",
  "musique",
  "sound",
  "photo",
  "photography",
  "podcast",
  "video",
  "production",
  "productions",
  "rehearsal",
  "room",
  "rooms",
  "media",
  "creative",
  "creatives",
  "estudio",
  "estudios",
  "استوديو",
]);

const NON_IDENTITY_HOSTS = new Set([
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "x.com",
  "twitter.com",
]);

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeCountryCode(value: string | null | undefined) {
  const code = value?.trim().toUpperCase() || "";
  return /^[A-Z]{2}$/.test(code) ? code : "";
}

function finiteCoordinate(value: string | number | null | undefined) {
  if (value == null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizePhone(value: string | null | undefined) {
  if (!value) return "";
  let digits = value.replace(/\D+/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  return digits.length >= 8 ? digits : "";
}

function normalizeInstagram(value: string | null | undefined) {
  if (!value) return "";

  const raw = value.trim();
  if (!raw) return "";

  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "instagram.com" || host.endsWith(".instagram.com")) {
      return (url.pathname.split("/").filter(Boolean)[0] || "")
        .replace(/^@/, "")
        .toLowerCase();
    }
  } catch {
    // Fall back to handle parsing below.
  }

  return raw
    .replace(/^@/, "")
    .split(/[/?#]/)[0]
    .trim()
    .toLowerCase();
}

function normalizeWebsiteHost(value: string | null | undefined) {
  if (!value) return "";

  const raw = value.trim();
  if (!raw) return "";

  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const url = new URL(withScheme);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (!host || NON_IDENTITY_HOSTS.has(host)) return "";
    return host;
  } catch {
    return "";
  }
}

function normalizedName(value: DedupCandidate) {
  return normalizeSearchText(value.normalizedName || value.name);
}

function significantNameTokens(value: string) {
  return normalizeSearchText(value)
    .split(" ")
    .filter((token) => token.length > 1 && !GENERIC_NAME_TOKENS.has(token));
}

function jaccard(left: readonly string[], right: readonly string[]) {
  if (left.length === 0 || right.length === 0) return 0;

  const a = new Set(left);
  const b = new Set(right);
  let intersection = 0;

  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }

  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function trigrams(value: string) {
  const compact = `  ${normalizeSearchText(value).replace(/\s+/g, " ")}  `;
  if (compact.trim().length === 0) return [];

  const result: string[] = [];
  for (let index = 0; index <= compact.length - 3; index += 1) {
    result.push(compact.slice(index, index + 3));
  }
  return result;
}

function dice(left: readonly string[], right: readonly string[]) {
  if (left.length === 0 || right.length === 0) return 0;

  const rightCounts = new Map<string, number>();
  for (const item of right) {
    rightCounts.set(item, (rightCounts.get(item) || 0) + 1);
  }

  let matches = 0;
  for (const item of left) {
    const remaining = rightCounts.get(item) || 0;
    if (remaining > 0) {
      matches += 1;
      rightCounts.set(item, remaining - 1);
    }
  }

  return (2 * matches) / (left.length + right.length);
}

export function nameSimilarity(left: string, right: string) {
  const a = normalizeSearchText(left);
  const b = normalizeSearchText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  const significantA = significantNameTokens(a);
  const significantB = significantNameTokens(b);
  const tokenScore = jaccard(significantA, significantB);
  const trigramScore = dice(trigrams(a), trigrams(b));

  if (significantA.length > 0 && significantB.length > 0) {
    return Math.max(tokenScore, tokenScore * 0.65 + trigramScore * 0.35);
  }

  return trigramScore;
}

export function addressSimilarity(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeSearchText(left);
  const b = normalizeSearchText(right);
  if (!a || !b) return 0;
  if (a === b) return 1;

  return Math.max(
    jaccard(a.split(" "), b.split(" ")),
    dice(trigrams(a), trigrams(b)),
  );
}

export function distanceMetersBetween(
  left: Pick<DedupCandidate, "latitude" | "longitude">,
  right: Pick<DedupCandidate, "latitude" | "longitude">,
) {
  const lat1 = finiteCoordinate(left.latitude);
  const lon1 = finiteCoordinate(left.longitude);
  const lat2 = finiteCoordinate(right.latitude);
  const lon2 = finiteCoordinate(right.longitude);

  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  if (
    Math.abs(lat1) > 90 ||
    Math.abs(lat2) > 90 ||
    Math.abs(lon1) > 180 ||
    Math.abs(lon2) > 180
  ) {
    return null;
  }

  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;

  const phi1 = radians(lat1);
  const phi2 = radians(lat2);
  const deltaPhi = radians(lat2 - lat1);
  const deltaLambda = radians(lon2 - lon1);

  const a =
    Math.sin(deltaPhi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda / 2) ** 2;

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function sameNormalizedText(left: string | null | undefined, right: string | null | undefined) {
  const a = normalizeSearchText(left);
  const b = normalizeSearchText(right);
  return Boolean(a && b && a === b);
}

export function evaluateDedupCandidate(
  incoming: DedupCandidate,
  existing: DedupCandidate,
): DedupEvaluation {
  const reasons: string[] = [];
  const conflicts: string[] = [];

  const incomingCountry = normalizeCountryCode(incoming.countryCode);
  const existingCountry = normalizeCountryCode(existing.countryCode);
  if (incomingCountry && existingCountry && incomingCountry !== existingCountry) {
    return {
      decision: "DISTINCT",
      score: 0,
      reasons: [],
      conflicts: ["COUNTRY_MISMATCH"],
      strongIdentityMatches: 0,
      nameSimilarity: nameSimilarity(normalizedName(incoming), normalizedName(existing)),
      addressSimilarity: addressSimilarity(incoming.address, existing.address),
      distanceMeters: distanceMetersBetween(incoming, existing),
    };
  }

  let score = 0;
  let strongIdentityMatches = 0;

  const incomingHost = normalizeWebsiteHost(incoming.website);
  const existingHost = normalizeWebsiteHost(existing.website);
  if (incomingHost && existingHost && incomingHost === existingHost) {
    score += 42;
    strongIdentityMatches += 1;
    reasons.push("WEBSITE_HOST_EXACT");
  }

  const incomingInstagram = normalizeInstagram(incoming.instagram);
  const existingInstagram = normalizeInstagram(existing.instagram);
  if (incomingInstagram && existingInstagram && incomingInstagram === existingInstagram) {
    score += 46;
    strongIdentityMatches += 1;
    reasons.push("INSTAGRAM_EXACT");
  }

  const incomingPhone = normalizePhone(incoming.phone);
  const existingPhone = normalizePhone(existing.phone);
  if (incomingPhone && existingPhone && incomingPhone === existingPhone) {
    score += 48;
    strongIdentityMatches += 1;
    reasons.push("PHONE_EXACT");
  }

  const nameScore = nameSimilarity(normalizedName(incoming), normalizedName(existing));
  if (nameScore >= 0.98) {
    score += 34;
    reasons.push("NAME_EXACT_OR_NEAR_EXACT");
  } else if (nameScore >= 0.88) {
    score += 28;
    reasons.push("NAME_VERY_SIMILAR");
  } else if (nameScore >= 0.72) {
    score += 18;
    reasons.push("NAME_SIMILAR");
  } else if (nameScore >= 0.55) {
    score += 8;
    reasons.push("NAME_WEAKLY_SIMILAR");
  }

  const addressScore = addressSimilarity(incoming.address, existing.address);
  if (addressScore >= 0.96) {
    score += 24;
    reasons.push("ADDRESS_EXACT_OR_NEAR_EXACT");
  } else if (addressScore >= 0.8) {
    score += 16;
    reasons.push("ADDRESS_SIMILAR");
  }

  const sameCity = sameNormalizedText(incoming.city, existing.city);
  if (sameCity) {
    score += 8;
    reasons.push("CITY_EXACT");
  } else if (incoming.city && existing.city) {
    score -= 8;
    conflicts.push("CITY_MISMATCH");
  }

  if (sameNormalizedText(incoming.district, existing.district)) {
    score += 4;
    reasons.push("DISTRICT_EXACT");
  }

  if (
    incoming.postalCode &&
    existing.postalCode &&
    incoming.postalCode.trim().toUpperCase() === existing.postalCode.trim().toUpperCase()
  ) {
    score += 6;
    reasons.push("POSTAL_CODE_EXACT");
  }

  if (
    incoming.category &&
    existing.category &&
    incoming.category === existing.category
  ) {
    score += 4;
    reasons.push("CATEGORY_EXACT");
  }

  const distanceMeters = distanceMetersBetween(incoming, existing);
  let strongLocation = addressScore >= 0.8;

  if (distanceMeters != null) {
    if (distanceMeters <= 80) {
      score += 34;
      strongLocation = true;
      reasons.push("COORDINATES_WITHIN_80M");
    } else if (distanceMeters <= 250) {
      score += 24;
      strongLocation = true;
      reasons.push("COORDINATES_WITHIN_250M");
    } else if (distanceMeters <= 750) {
      score += 12;
      reasons.push("COORDINATES_WITHIN_750M");
    } else if (distanceMeters >= 10_000) {
      score -= 45;
      conflicts.push("COORDINATES_FAR_APART");
    } else if (distanceMeters >= 3_000) {
      score -= 22;
      conflicts.push("COORDINATES_SEPARATED");
    }
  }

  const locationConflict =
    distanceMeters != null &&
    distanceMeters >= 10_000 &&
    addressScore < 0.8;

  // A brand can reuse the same website, phone or social profile across branches.
  // A large physical separation therefore wins over identity signals.
  if (locationConflict) {
    return {
      decision: "DISTINCT",
      score: clampScore(score),
      reasons,
      conflicts,
      strongIdentityMatches,
      nameSimilarity: nameScore,
      addressSimilarity: addressScore,
      distanceMeters,
    };
  }

  const conservativeAutoMatch =
    score >= 80 &&
    nameScore >= 0.55 &&
    (
      strongIdentityMatches >= 2 ||
      (strongIdentityMatches >= 1 && strongLocation) ||
      (nameScore >= 0.98 && distanceMeters != null && distanceMeters <= 80)
    );

  if (conservativeAutoMatch) {
    return {
      decision: "AUTO_MATCH",
      score: clampScore(score),
      reasons,
      conflicts,
      strongIdentityMatches,
      nameSimilarity: nameScore,
      addressSimilarity: addressScore,
      distanceMeters,
    };
  }

  const needsReview =
    score >= 45 ||
    strongIdentityMatches >= 1 ||
    (nameScore >= 0.72 && (strongLocation || sameCity));

  return {
    decision: needsReview ? "REVIEW" : "DISTINCT",
    score: clampScore(score),
    reasons,
    conflicts,
    strongIdentityMatches,
    nameSimilarity: nameScore,
    addressSimilarity: addressScore,
    distanceMeters,
  };
}

function decisionRank(value: DedupDecision) {
  if (value === "AUTO_MATCH") return 2;
  if (value === "REVIEW") return 1;
  return 0;
}

export function chooseDedupMatch(
  incoming: DedupCandidate,
  existingCandidates: readonly DedupCandidate[],
): DedupSelection {
  const evaluated = existingCandidates
    .filter((candidate): candidate is DedupCandidate & { id: string } => Boolean(candidate.id))
    .map((candidate) => ({
      candidate,
      evaluation: evaluateDedupCandidate(incoming, candidate),
    }))
    .sort((left, right) => {
      const rankDifference =
        decisionRank(right.evaluation.decision) - decisionRank(left.evaluation.decision);
      if (rankDifference !== 0) return rankDifference;
      return right.evaluation.score - left.evaluation.score;
    });

  const top = evaluated[0];
  if (!top || top.evaluation.decision === "DISTINCT") {
    return {
      decision: "DISTINCT",
      candidateId: null,
      evaluation: top?.evaluation || null,
      ambiguousCandidateIds: [],
    };
  }

  const second = evaluated[1];
  const ambiguous =
    second &&
    second.evaluation.decision !== "DISTINCT" &&
    (
      second.evaluation.decision === top.evaluation.decision ||
      second.evaluation.score >= top.evaluation.score - 8
    );

  if (ambiguous) {
    return {
      decision: "REVIEW",
      candidateId: null,
      evaluation: top.evaluation,
      ambiguousCandidateIds: [top.candidate.id, second.candidate.id],
    };
  }

  return {
    decision: top.evaluation.decision,
    candidateId: top.candidate.id,
    evaluation: top.evaluation,
    ambiguousCandidateIds: [],
  };
}

export function buildCandidateBlockingKeys(candidate: DedupCandidate) {
  const keys = new Set<string>();

  const country = normalizeCountryCode(candidate.countryCode);
  const city = normalizeSearchText(candidate.city);
  const name = normalizedName(candidate);
  const coreName = significantNameTokens(name).join(" ");

  const website = normalizeWebsiteHost(candidate.website);
  if (website) keys.add(`web:${website}`);

  const instagram = normalizeInstagram(candidate.instagram);
  if (instagram) keys.add(`ig:${instagram}`);

  const phone = normalizePhone(candidate.phone);
  if (phone) keys.add(`phone:${phone}`);

  if (country && city && coreName) {
    keys.add(`geo-name:${country}:${city}:${coreName}`);
  }

  const latitude = finiteCoordinate(candidate.latitude);
  const longitude = finiteCoordinate(candidate.longitude);
  if (country && latitude != null && longitude != null) {
    // Roughly 1.1 km latitude cells; used only to build a candidate shortlist.
    keys.add(
      `cell:${country}:${Math.round(latitude * 100)}:${Math.round(longitude * 100)}`,
    );
  }

  return [...keys].sort();
}
