export type DiscoveryRolloutCapability =
  | "PUBLIC_DISCOVERY"
  | "CLAIMS"
  | "ONBOARDING";

export type DiscoveryRolloutScope = {
  countryCode: string;
  city: string;
  publicDiscovery: boolean;
  claims: boolean;
  onboarding: boolean;
};

export const DISCOVERY_ROLLOUT_SCOPES: readonly DiscoveryRolloutScope[] = [
  {
    countryCode: "MA",
    city: "Casablanca",
    publicDiscovery: true,
    claims: true,
    onboarding: true,
  },
] as const;

function normalizeLocation(value: string | null | undefined) {
  return String(value || "")
    .trim()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function capabilityEnabled(
  scope: DiscoveryRolloutScope,
  capability: DiscoveryRolloutCapability,
) {
  if (capability === "PUBLIC_DISCOVERY") return scope.publicDiscovery;
  if (capability === "CLAIMS") return scope.claims;
  return scope.onboarding;
}

export function discoveryRolloutScopes(
  capability: DiscoveryRolloutCapability,
) {
  return DISCOVERY_ROLLOUT_SCOPES.filter((scope) =>
    capabilityEnabled(scope, capability),
  );
}

export function isDiscoveryRolloutEnabled(
  location: {
    countryCode: string | null | undefined;
    city: string | null | undefined;
  },
  capability: DiscoveryRolloutCapability,
) {
  const countryCode = String(location.countryCode || "").trim().toUpperCase();
  const city = normalizeLocation(location.city);

  if (!countryCode || !city) return false;

  return discoveryRolloutScopes(capability).some(
    (scope) =>
      scope.countryCode === countryCode &&
      normalizeLocation(scope.city) === city,
  );
}

export function discoveryRolloutWhere(
  capability: DiscoveryRolloutCapability,
) {
  const scopes = discoveryRolloutScopes(capability);

  if (scopes.length === 0) {
    return { id: "__NO_DISCOVERY_ROLLOUT_SCOPE__" };
  }

  return {
    OR: scopes.map((scope) => ({
      countryCode: scope.countryCode,
      city: {
        equals: scope.city,
        mode: "insensitive" as const,
      },
    })),
  };
}
