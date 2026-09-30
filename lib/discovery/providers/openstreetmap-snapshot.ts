import snapshot from "@/data/discovery/osm/casablanca.json";
import {
  OSM_SCAN_PRESETS,
  parseOpenStreetMapStudioResponse,
  type DiscoveryScanContext,
  type OpenStreetMapScanResult,
} from "@/lib/discovery/providers/openstreetmap";

type SnapshotShape = {
  provider?: unknown;
  delivery?: unknown;
  sourceUrl?: unknown;
  generatedAt?: unknown;
  elements?: unknown;
};

function asSnapshot() {
  return snapshot as SnapshotShape;
}

export function getOpenStreetMapSnapshotInfo() {
  const data = asSnapshot();
  return {
    generatedAt: typeof data.generatedAt === "string" ? data.generatedAt : null,
    sourceUrl: typeof data.sourceUrl === "string" ? data.sourceUrl : null,
    rawElementCount: Array.isArray(data.elements) ? data.elements.length : 0,
  };
}

export function loadOpenStreetMapSnapshot(
  context: DiscoveryScanContext = OSM_SCAN_PRESETS.CASABLANCA,
): OpenStreetMapScanResult {
  if (context.key !== "CASABLANCA") {
    throw new Error("OSM_SNAPSHOT_PRESET_UNSUPPORTED");
  }

  const data = asSnapshot();
  if (typeof data.generatedAt !== "string") {
    throw new Error("OSM_SNAPSHOT_NOT_READY");
  }

  const parsed = parseOpenStreetMapStudioResponse(
    { elements: Array.isArray(data.elements) ? data.elements : [] },
    context,
  );

  return {
    endpoint:
      typeof data.sourceUrl === "string"
        ? `geofabrik:${data.sourceUrl}`
        : "geofabrik:unknown",
    context,
    fetchedAt: data.generatedAt,
    ...parsed,
  };
}
