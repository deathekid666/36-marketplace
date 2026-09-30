export type DiscoveryProviderKey = "OVERTURE" | "OPENSTREETMAP";

export type DiscoveryProviderDefinition = {
  key: DiscoveryProviderKey;
  label: string;
  role: "PRIMARY" | "SECONDARY";
  delivery: string;
  attribution: string;
  licenseUrl: string;
  notes: string;
};

export const DISCOVERY_PROVIDERS: readonly DiscoveryProviderDefinition[] = [
  {
    key: "OVERTURE",
    label: "Overture Maps",
    role: "PRIMARY",
    delivery: "Repository snapshot",
    attribution: "Overture Maps Foundation",
    licenseUrl: "https://docs.overturemaps.org/attribution/",
    notes:
      "Primary structured Places source for the controlled discovery pilot.",
  },
  {
    key: "OPENSTREETMAP",
    label: "OpenStreetMap",
    role: "SECONDARY",
    delivery: "Morocco PBF → Casablanca repository snapshot",
    attribution: "© OpenStreetMap contributors",
    licenseUrl: "https://www.openstreetmap.org/copyright",
    notes:
      "Independent secondary evidence source. Empty snapshots are never treated as candidate deletions.",
  },
] as const;

export function discoveryProvider(
  key: DiscoveryProviderKey,
): DiscoveryProviderDefinition {
  const provider = DISCOVERY_PROVIDERS.find((item) => item.key === key);
  if (!provider) throw new Error("DISCOVERY_PROVIDER_UNKNOWN");
  return provider;
}
