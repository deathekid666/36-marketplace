import { NextResponse } from "next/server";

import { consolidateSafeDiscoveryDuplicates } from "@/lib/discovery/consolidation";
import { verifyGlobalImportOidcToken } from "@/lib/discovery/github-oidc";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  let maxMerges = 12;
  try {
    const body = (await request.json()) as { maxMerges?: unknown };
    const parsed = Number(body?.maxMerges);
    if (Number.isFinite(parsed)) {
      maxMerges = Math.max(1, Math.min(40, Math.floor(parsed)));
    }
  } catch {
    // Empty body uses the conservative default.
  }

  const result = await consolidateSafeDiscoveryDuplicates(maxMerges);
  console.info("discovery-duplicate-consolidation", {
    scanned: result.scanned,
    proposals: result.proposals,
    merged: result.merged,
  });
  return NextResponse.json({ ok: true, ...result });
}
