"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { ingestDiscoveryStudio } from "@/lib/discovery/ingest";
import { loadOpenStreetMapSnapshot } from "@/lib/discovery/providers/openstreetmap-snapshot";
import { loadOvertureSnapshot } from "@/lib/discovery/providers/overture";
import { consumeRateLimit } from "@/lib/rate-limit";

type ProviderKey = "OVERTURE" | "OPENSTREETMAP";

type ImportScan = {
  records: Parameters<typeof ingestDiscoveryStudio>[0][];
};

function importErrorCode(provider: ProviderKey, error: unknown) {
  const message = error instanceof Error ? error.message : "IMPORT_FAILED";

  if (message === "OVERTURE_SNAPSHOT_NOT_READY") return "snapshot-not-ready";
  if (message === "OVERTURE_SNAPSHOT_EMPTY") return "snapshot-empty";
  if (message === "OSM_SNAPSHOT_NOT_READY") return "snapshot-not-ready";
  if (message === "OSM_SNAPSHOT_EMPTY") return "snapshot-empty";

  return "import-failed";
}

async function runImport(
  provider: ProviderKey,
  adminId: string,
  load: () => ImportScan,
) {
  const rate = await consumeRateLimit({
    key: `discovery-${provider.toLowerCase()}:${adminId}`,
    action: `${provider}_ADMIN_IMPORT`,
    limit: 4,
    windowSeconds: 60 * 60,
  });

  if (!rate.allowed) {
    redirect(`/admin/discovery?provider=${provider}&importError=scan-rate-limited`);
  }

  let destination = `/admin/discovery?provider=${provider}&importError=import-failed`;

  try {
    const scan = load();

    if (scan.records.length === 0) {
      throw new Error(provider === "OPENSTREETMAP" ? "OSM_SNAPSHOT_EMPTY" : "OVERTURE_SNAPSHOT_EMPTY");
    }

    const stats = {
      enriched: 0,
      review: 0,
      matched: 0,
      refreshed: 0,
    };

    for (const record of scan.records) {
      const result = await ingestDiscoveryStudio(record);
      if (result.outcome === "CREATED_ENRICHED") stats.enriched += 1;
      if (result.outcome === "CREATED_REVIEW") stats.review += 1;
      if (result.outcome === "AUTO_MATCHED") stats.matched += 1;
      if (result.outcome === "REFRESHED") stats.refreshed += 1;
    }

    revalidatePath("/admin");
    revalidatePath("/admin/discovery");

    const params = new URLSearchParams({
      provider,
      imported: String(scan.records.length),
      enriched: String(stats.enriched),
      review: String(stats.review),
      matched: String(stats.matched),
      refreshed: String(stats.refreshed),
    });

    destination = `/admin/discovery?${params.toString()}`;
  } catch (error) {
    destination = `/admin/discovery?provider=${provider}&importError=${importErrorCode(provider, error)}`;
  }

  redirect(destination);
}

export async function importOvertureAction() {
  const admin = await requireRole("ADMIN");
  return runImport("OVERTURE", admin.id, () => loadOvertureSnapshot());
}

export async function importOpenStreetMapAction() {
  const admin = await requireRole("ADMIN");

  return runImport("OPENSTREETMAP", admin.id, () => {
    const scan = loadOpenStreetMapSnapshot();
    return {
      records: scan.records.map((record) => ({
        provider: record.provider,
        sourceKey: record.sourceKey,
        externalId: record.externalId,
        sourceUrl: record.sourceUrl,
        providerCategory: record.providerCategory,
        attribution: record.attribution,
        licenseUrl: record.licenseUrl,
        name: record.name,
        normalizedName: record.normalizedName,
        category: record.category,
        categoryConfidence: record.categoryConfidence,
        categoryEvidence: record.categoryEvidence,
        categoryAlternatives: record.categoryAlternatives,
        countryCode: record.countryCode,
        country: record.country,
        region: record.region,
        city: record.city,
        district: record.district,
        postalCode: record.postalCode,
        address: record.address,
        latitude: record.latitude,
        longitude: record.longitude,
        phone: record.phone,
        email: record.email,
        website: record.website,
        instagram: record.instagram,
        issues: record.issues,
        slugHint: `${record.osmType}-${record.osmId}`,
        metadata: {
          osmTimestamp: record.osmTimestamp,
          tags: record.tags,
        },
      })),
    };
  });
}
