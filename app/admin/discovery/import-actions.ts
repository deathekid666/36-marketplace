"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { ingestOpenStreetMapStudio } from "@/lib/discovery/ingest";
import {
  fetchOpenStreetMapStudios,
  OSM_SCAN_PRESETS,
} from "@/lib/discovery/providers/openstreetmap";
import { consumeRateLimit } from "@/lib/rate-limit";

function text(form: FormData, name: string, max = 80) {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

function importErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "OSM_IMPORT_FAILED";
  if (message === "OSM_RATE_LIMITED") return "provider-busy";
  if (message === "OSM_REQUEST_TIMEOUT") return "provider-timeout";
  if (message === "OSM_REQUEST_FAILED") return "provider-unreachable";
  if (message === "OSM_RESPONSE_TOO_LARGE" || message === "OSM_RESULT_SET_TOO_LARGE") {
    return "result-too-large";
  }
  if (message.startsWith("OSM_HTTP_")) return "provider-error";
  if (message.startsWith("OSM_")) return "provider-error";
  return "import-failed";
}

export async function importOpenStreetMapAction(form: FormData) {
  const admin = await requireRole("ADMIN");
  const presetKey = text(form, "preset", 40).toUpperCase();
  const preset = OSM_SCAN_PRESETS[presetKey];

  if (!preset) redirect("/admin/discovery?importError=invalid-preset");

  const rate = await consumeRateLimit({
    key: `discovery-osm:${admin.id}`,
    action: "OPENSTREETMAP_ADMIN_SCAN",
    limit: 4,
    windowSeconds: 60 * 60,
  });

  if (!rate.allowed) {
    redirect("/admin/discovery?importError=scan-rate-limited");
  }

  let destination = "/admin/discovery?importError=import-failed";

  try {
    const scan = await fetchOpenStreetMapStudios(preset);

    const stats = {
      enriched: 0,
      review: 0,
      matched: 0,
      refreshed: 0,
    };

    for (const record of scan.records) {
      const result = await ingestOpenStreetMapStudio(record);
      if (result.outcome === "CREATED_ENRICHED") stats.enriched += 1;
      if (result.outcome === "CREATED_REVIEW") stats.review += 1;
      if (result.outcome === "AUTO_MATCHED") stats.matched += 1;
      if (result.outcome === "REFRESHED") stats.refreshed += 1;
    }

    revalidatePath("/admin");
    revalidatePath("/admin/discovery");

    const params = new URLSearchParams({
      imported: String(scan.records.length),
      enriched: String(stats.enriched),
      review: String(stats.review),
      matched: String(stats.matched),
      refreshed: String(stats.refreshed),
      skipped: String(scan.skippedWithoutName),
      preset: preset.key,
    });

    destination = `/admin/discovery?${params.toString()}`;
  } catch (error) {
    destination = `/admin/discovery?importError=${importErrorCode(error)}`;
  }

  redirect(destination);
}
