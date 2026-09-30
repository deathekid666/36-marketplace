import { NextResponse } from "next/server";

import { db } from "@/lib/db";
import { ingestDiscoveryStudio } from "@/lib/discovery/ingest";
import { loadOvertureSnapshot } from "@/lib/discovery/providers/overture";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRM = "D6_OVERTURE_CASABLANCA_ONCE";
const BATCH_SIZE = 10;

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ ok: false, error: "PRODUCTION_ONLY" }, { status: 403 });
  }

  const url = new URL(request.url);
  if (url.searchParams.get("confirm") !== CONFIRM) {
    return NextResponse.json({ ok: false, error: "CONFIRMATION_REQUIRED" }, { status: 403 });
  }

  const offset = Number.parseInt(url.searchParams.get("offset") || "0", 10);
  if (![0, 10, 20, 30, 40].includes(offset)) {
    return NextResponse.json({ ok: false, error: "INVALID_OFFSET" }, { status: 400 });
  }

  const existingSources = await db.candidateStudioSource.count({
    where: { provider: "OVERTURE" },
  });

  if (offset === 0 && existingSources > 0) {
    return NextResponse.json(
      { ok: false, error: "D6_ALREADY_STARTED", existingSources },
      { status: 409 },
    );
  }

  const scan = loadOvertureSnapshot();
  const records = scan.records.slice(offset, offset + BATCH_SIZE);

  const stats = {
    enriched: 0,
    review: 0,
    matched: 0,
    refreshed: 0,
  };

  const imported: Array<{ sourceKey: string; candidateId: string; outcome: string }> = [];

  try {
    for (const record of records) {
      const result = await ingestDiscoveryStudio(record);
      if (result.outcome === "CREATED_ENRICHED") stats.enriched += 1;
      if (result.outcome === "CREATED_REVIEW") stats.review += 1;
      if (result.outcome === "AUTO_MATCHED") stats.matched += 1;
      if (result.outcome === "REFRESHED") stats.refreshed += 1;
      imported.push(result);
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "IMPORT_FAILED",
        offset,
        imported,
        stats,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    offset,
    batchSize: records.length,
    totalSnapshotRecords: scan.records.length,
    stats,
    imported,
  });
}
