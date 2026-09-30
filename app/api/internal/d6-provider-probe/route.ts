import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

const ENDPOINTS = [
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  "https://overpass-api.de/api/interpreter",
];

const QUERY = `[out:json][timeout:6];
(
  nwr["amenity"="studio"](33.45,-7.75,33.70,-7.45);
  nwr["shop"="photo_studio"](33.45,-7.75,33.70,-7.45);
);
out count;`;

async function probe(endpoint: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  const started = Date.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/json",
        "User-Agent": "36-marketplace-provider-probe/0.1 (+https://36-marketplace.vercel.app)",
        Referer: "https://36-marketplace.vercel.app/admin/discovery",
      },
      body: new URLSearchParams({ data: QUERY }),
      cache: "no-store",
      signal: controller.signal,
    });

    const body = await response.text();
    let total: number | null = null;
    if (response.ok) {
      try {
        const payload = JSON.parse(body);
        const tags = payload?.elements?.[0]?.tags;
        total = Number(tags?.total ?? tags?.nodes ?? 0);
        if (!Number.isFinite(total)) total = null;
      } catch {
        // keep total null
      }
    }

    return {
      endpoint,
      ok: response.ok,
      status: response.status,
      elapsedMs: Date.now() - started,
      total,
      bodyPreview: response.ok ? null : body.slice(0, 160),
    };
  } catch (error) {
    return {
      endpoint,
      ok: false,
      status: 0,
      elapsedMs: Date.now() - started,
      error: error instanceof Error ? error.name : "UNKNOWN",
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("confirm") !== "D6_PROVIDER_PROBE") {
    return NextResponse.json({ ok: false, error: "CONFIRMATION_REQUIRED" }, { status: 403 });
  }

  const results = await Promise.all(ENDPOINTS.map(probe));
  return NextResponse.json({ ok: results.some((result) => result.ok), results });
}
