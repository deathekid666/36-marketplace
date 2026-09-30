"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { ingestDiscoveryStudio } from "@/lib/discovery/ingest";
import { loadOvertureSnapshot } from "@/lib/discovery/providers/overture";
import { consumeRateLimit } from "@/lib/rate-limit";

function importErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "OVERTURE_IMPORT_FAILED";
  if (message === "OVERTURE_SNAPSHOT_NOT_READY") return "snapshot-not-ready";
  if (message === "OVERTURE_SNAPSHOT_EMPTY") return "snapshot-empty";
  return "import-failed";
}

export async function importOvertureAction() {
  const admin = await requireRole("ADMIN");

  const rate = await consumeRateLimit({
    key: `discovery-overture:${admin.id}`,
    action: "OVERTURE_ADMIN_IMPORT",
    limit: 4,
    windowSeconds: 60 * 60,
  });

  if (!rate.allowed) {
    redirect("/admin/discovery?importError=scan-rate-limited");
  }

  let destination = "/admin/discovery?importError=import-failed";

  try {
    const scan = loadOvertureSnapshot();

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
      provider: "OVERTURE",
      imported: String(scan.records.length),
      enriched: String(stats.enriched),
      review: String(stats.review),
      matched: String(stats.matched),
      refreshed: String(stats.refreshed),
    });

    destination = `/admin/discovery?${params.toString()}`;
  } catch (error) {
    destination = `/admin/discovery?importError=${importErrorCode(error)}`;
  }

  redirect(destination);
}
