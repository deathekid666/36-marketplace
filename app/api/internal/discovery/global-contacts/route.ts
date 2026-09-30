import { NextResponse } from "next/server";

import { ingestDiscoveryStudio } from "@/lib/discovery/ingest";
import { verifyGlobalImportOidcToken } from "@/lib/discovery/github-oidc";
import {
  overtureGlobalContactRecord,
  type OvertureGlobalContactPayload,
} from "@/lib/discovery/providers/overture-contact";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCH = 12;
const MAX_BODY_BYTES = 700_000;

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : "";

  if (!token) {
    return NextResponse.json({ ok: false, error: "OIDC_TOKEN_REQUIRED" }, { status: 401 });
  }

  try {
    await verifyGlobalImportOidcToken(token);
  } catch {
    return NextResponse.json({ ok: false, error: "OIDC_TOKEN_INVALID" }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_JSON" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const payload = body as { release?: unknown; records?: unknown };
  const release =
    typeof payload.release === "string" && payload.release.trim()
      ? payload.release.trim().slice(0, 80)
      : "unknown";

  if (!Array.isArray(payload.records) || payload.records.length === 0) {
    return NextResponse.json({ ok: false, error: "RECORDS_REQUIRED" }, { status: 400 });
  }

  if (payload.records.length > MAX_BATCH) {
    return NextResponse.json({ ok: false, error: "BATCH_TOO_LARGE" }, { status: 413 });
  }

  const stats = {
    received: payload.records.length,
    accepted: 0,
    skipped: 0,
    enriched: 0,
    review: 0,
    matched: 0,
    refreshed: 0,
  };

  for (const raw of payload.records) {
    if (!raw || typeof raw !== "object") {
      stats.skipped += 1;
      continue;
    }

    const record = overtureGlobalContactRecord(
      raw as OvertureGlobalContactPayload,
      release,
    );

    if (!record) {
      stats.skipped += 1;
      continue;
    }

    const result = await ingestDiscoveryStudio(record);
    stats.accepted += 1;

    if (result.outcome === "CREATED_ENRICHED") stats.enriched += 1;
    if (result.outcome === "CREATED_REVIEW") stats.review += 1;
    if (result.outcome === "AUTO_MATCHED") stats.matched += 1;
    if (result.outcome === "REFRESHED") stats.refreshed += 1;
  }

  return NextResponse.json({ ok: true, release, stats });
}
