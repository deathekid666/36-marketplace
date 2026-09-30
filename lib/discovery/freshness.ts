export const DISCOVERY_AGING_AFTER_DAYS = 45;
export const DISCOVERY_STALE_AFTER_DAYS = 90;

export type DiscoveryFreshness = "FRESH" | "AGING" | "STALE" | "UNKNOWN";

const DAY_MS = 24 * 60 * 60 * 1000;

export function discoveryStaleCutoff(now = new Date()) {
  return new Date(now.getTime() - DISCOVERY_STALE_AFTER_DAYS * DAY_MS);
}

export function discoveryFreshness(
  lastCheckedAt: Date | string | null | undefined,
  now = new Date(),
): DiscoveryFreshness {
  if (!lastCheckedAt) return "UNKNOWN";

  const checked =
    lastCheckedAt instanceof Date ? lastCheckedAt : new Date(lastCheckedAt);
  if (Number.isNaN(checked.getTime())) return "UNKNOWN";

  const ageDays = Math.max(0, (now.getTime() - checked.getTime()) / DAY_MS);
  if (ageDays > DISCOVERY_STALE_AFTER_DAYS) return "STALE";
  if (ageDays > DISCOVERY_AGING_AFTER_DAYS) return "AGING";
  return "FRESH";
}

export function discoveryFreshnessLabel(value: DiscoveryFreshness) {
  switch (value) {
    case "FRESH":
      return "Fresh";
    case "AGING":
      return "Aging";
    case "STALE":
      return "Stale";
    case "UNKNOWN":
      return "Not checked";
  }
}

export function discoveryFreshnessClass(value: DiscoveryFreshness) {
  switch (value) {
    case "FRESH":
      return "border-emerald-900/50 text-emerald-300";
    case "AGING":
      return "border-amber-900/50 text-amber-300";
    case "STALE":
      return "border-red-900/50 text-red-300";
    case "UNKNOWN":
      return "border-zinc-800 text-zinc-500";
  }
}
