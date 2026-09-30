import fs from "node:fs/promises";
import path from "node:path";

const inputPath = process.argv[2] || "tmp/studios.geojson";
const outputPath = process.argv[3] || "data/discovery/osm/casablanca.json";

const raw = JSON.parse(await fs.readFile(inputPath, "utf8"));
const features = Array.isArray(raw?.features) ? raw.features : [];

function parseIdentity(feature) {
  const props = feature?.properties && typeof feature.properties === "object"
    ? feature.properties
    : {};
  const rawId = feature?.id ?? props["@id"] ?? props.id ?? "";
  const match = String(rawId).match(/^(node|way|relation)\/(\d+)$/);
  if (!match) return null;
  return { type: match[1], id: Number(match[2]) };
}

function flattenPairs(value, pairs = []) {
  if (!Array.isArray(value)) return pairs;
  if (
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  ) {
    pairs.push([value[0], value[1]]);
    return pairs;
  }
  for (const child of value) flattenPairs(child, pairs);
  return pairs;
}

function centerOfGeometry(geometry) {
  if (!geometry || !Array.isArray(geometry.coordinates)) return null;
  const pairs = flattenPairs(geometry.coordinates);
  if (pairs.length === 0) return null;

  const [sumLon, sumLat] = pairs.reduce(
    ([lon, lat], [nextLon, nextLat]) => [lon + nextLon, lat + nextLat],
    [0, 0],
  );

  return {
    lon: sumLon / pairs.length,
    lat: sumLat / pairs.length,
  };
}

function osmTags(feature) {
  const props = feature?.properties && typeof feature.properties === "object"
    ? feature.properties
    : {};
  const tags = {};

  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("@")) continue;
    if (["id", "type", "version", "timestamp", "changeset", "uid", "user"].includes(key)) continue;
    if (typeof value === "string" && value.trim()) tags[key] = value.trim();
    else if (typeof value === "number" || typeof value === "boolean") tags[key] = String(value);
  }

  return tags;
}

const elements = [];

for (const feature of features) {
  const identity = parseIdentity(feature);
  if (!identity) continue;

  const tags = osmTags(feature);
  if (!(tags.amenity === "studio" || tags.shop === "photo_studio")) continue;

  const center = centerOfGeometry(feature.geometry);
  if (!center) continue;

  const element = {
    type: identity.type,
    id: identity.id,
    tags,
  };

  if (identity.type === "node" && feature.geometry?.type === "Point") {
    element.lat = center.lat;
    element.lon = center.lon;
  } else {
    element.center = { lat: center.lat, lon: center.lon };
  }

  elements.push(element);
}

elements.sort((a, b) => {
  if (a.type !== b.type) return a.type.localeCompare(b.type);
  return a.id - b.id;
});

const snapshot = {
  provider: "OPENSTREETMAP",
  delivery: "GEOFABRIK_PBF",
  sourceUrl: "https://download.geofabrik.de/africa/morocco-latest.osm.pbf",
  generatedAt: new Date().toISOString(),
  elements,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");

console.log(`D6 snapshot wrote ${elements.length} OSM studio features to ${outputPath}`);
