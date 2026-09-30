import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { ingestOpenStreetMapStudio } from "@/lib/discovery/ingest";
import {
  fetchOpenStreetMapStudios,
  OSM_SCAN_PRESETS,
} from "@/lib/discovery/providers/openstreetmap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ ok: false, error: "PRODUCTION_ONLY" }, { status: 403 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("confirm") !== "RUN_D6_CASABLANCA_ONCE") {
    return NextResponse.json({ ok: false, error: "CONFIRMATION_REQUIRED" }, { status: 403 });
  }

  const existingOsmSources = await db.candidateStudioSource.count({
    where: { provider: "OPENSTREETMAP" },
  });

  if (existingOsmSources > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "D6_ALREADY_EXECUTED",
        existingOsmSources,
      },
      { status: 409 },
    );
  }

  const scan = await fetchOpenStreetMapStudios(OSM_SCAN_PRESETS.CASABLANCA);

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

  return NextResponse.json({
    ok: true,
    preset: scan.context.key,
    imported: scan.records.length,
    skippedWithoutName: scan.skippedWithoutName,
    rawElementCount: scan.rawElementCount,
    stats,
  });
}
