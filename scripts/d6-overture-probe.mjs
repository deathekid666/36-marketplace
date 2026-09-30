import fs from "node:fs/promises";

const input = process.argv[2] || "tmp/casablanca-places.geojson";
const raw = JSON.parse(await fs.readFile(input, "utf8"));
const features = Array.isArray(raw?.features) ? raw.features : [];

function parseJsonish(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || !["{", "["].includes(trimmed[0])) return value;
  try { return JSON.parse(trimmed); } catch { return value; }
}

function norm(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function props(feature) {
  const p = feature?.properties && typeof feature.properties === "object"
    ? feature.properties
    : {};
  return Object.fromEntries(
    Object.entries(p).map(([k, v]) => [k, parseJsonish(v)]),
  );
}

function primaryName(p) {
  const names = parseJsonish(p.names);
  if (names && typeof names === "object") {
    return names.primary || names.common?.[0]?.value || null;
  }
  return p["names.primary"] || p.name || null;
}

function taxonomyValues(p) {
  const taxonomy = parseJsonish(p.taxonomy);
  const values = [];
  if (taxonomy && typeof taxonomy === "object") {
    if (taxonomy.primary) values.push(taxonomy.primary);
    if (Array.isArray(taxonomy.hierarchy)) values.push(...taxonomy.hierarchy);
    if (Array.isArray(taxonomy.alternates)) values.push(...taxonomy.alternates);
  }
  if (p["taxonomy.primary"]) values.push(p["taxonomy.primary"]);
  if (p.basic_category) values.push(p.basic_category);
  return values.filter(Boolean).map(String);
}

function isStudioCandidate(feature) {
  const p = props(feature);
  const name = primaryName(p);
  const tax = taxonomyValues(p);

  const text = norm([name, ...tax].filter(Boolean).join(" "));
  if (!text) return false;

  const exactTerms = [
    "recording studio",
    "music studio",
    "audio studio",
    "sound studio",
    "podcast studio",
    "photo studio",
    "photography studio",
    "video studio",
    "film studio",
    "production studio",
    "rehearsal studio",
    "studio enregistrement",
    "studio musique",
    "studio audio",
    "studio son",
    "studio podcast",
    "studio photo",
    "studio photographie",
    "studio video",
    "استوديو",
    "ستوديو",
  ];
  if (exactTerms.some((term) => text.includes(norm(term)))) return true;

  const categoryText = norm(tax.join(" "));
  return [
    "recording",
    "podcast",
    "photography",
    "photo studio",
    "video production",
    "music production",
    "rehearsal",
  ].some((term) => categoryText.includes(norm(term)));
}

const candidates = features.filter(isStudioCandidate).map((feature) => {
  const p = props(feature);
  return {
    id: p.id || feature.id || null,
    name: primaryName(p),
    taxonomy: taxonomyValues(p),
    confidence: p.confidence ?? null,
    coordinates: feature?.geometry?.coordinates ?? null,
    addresses: parseJsonish(p.addresses) ?? null,
    websites: parseJsonish(p.websites) ?? null,
    phones: parseJsonish(p.phones) ?? null,
    socials: parseJsonish(p.socials) ?? null,
  };
});

console.log(JSON.stringify({
  totalPlaces: features.length,
  candidateCount: candidates.length,
  sample: candidates.slice(0, 30),
}, null, 2));
