import fs from "node:fs/promises";
import path from "node:path";

const inputPath = process.argv[2] || "tmp/casablanca-places.geojson";
const outputPath = process.argv[3] || "data/discovery/overture/casablanca.json";

const raw = JSON.parse(await fs.readFile(inputPath, "utf8"));
const features = Array.isArray(raw?.features) ? raw.features : [];

function parseJsonish(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || !["{", "["].includes(trimmed[0])) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function normalizedProperties(feature) {
  const rawProps =
    feature?.properties && typeof feature.properties === "object"
      ? feature.properties
      : {};

  return Object.fromEntries(
    Object.entries(rawProps).map(([key, value]) => [key, parseJsonish(value)]),
  );
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

function primaryName(props) {
  const names = parseJsonish(props.names);

  if (names && typeof names === "object") {
    if (typeof names.primary === "string" && names.primary.trim()) {
      return names.primary.trim();
    }

    if (Array.isArray(names.common)) {
      const common = names.common.find(
        (entry) => entry && typeof entry.value === "string" && entry.value.trim(),
      );
      if (common) return common.value.trim();
    }
  }

  if (typeof props["names.primary"] === "string" && props["names.primary"].trim()) {
    return props["names.primary"].trim();
  }

  return null;
}

function taxonomyInfo(props) {
  const taxonomy = parseJsonish(props.taxonomy);
  const hierarchy = [];
  const alternates = [];
  let primary = null;

  if (taxonomy && typeof taxonomy === "object") {
    if (typeof taxonomy.primary === "string") primary = taxonomy.primary;
    if (Array.isArray(taxonomy.hierarchy)) hierarchy.push(...taxonomy.hierarchy.map(String));
    if (Array.isArray(taxonomy.alternates)) alternates.push(...taxonomy.alternates.map(String));
  }

  if (!primary && typeof props["taxonomy.primary"] === "string") {
    primary = props["taxonomy.primary"];
  }

  return {
    primary,
    hierarchy: [...new Set(hierarchy.filter(Boolean))],
    alternates: [...new Set(alternates.filter(Boolean))],
    basicCategory:
      typeof props.basic_category === "string" ? props.basic_category : null,
  };
}

function listValue(value) {
  const parsed = parseJsonish(value);
  return Array.isArray(parsed) ? parsed : [];
}

function firstString(values) {
  const value = values.find((entry) => typeof entry === "string" && entry.trim());
  return typeof value === "string" ? value.trim() : null;
}

function isCreativeStudio(name, taxonomy) {
  const nameText = norm(name);
  const categoryText = norm(
    [
      taxonomy.primary,
      taxonomy.basicCategory,
      ...taxonomy.hierarchy,
      ...taxonomy.alternates,
    ]
      .filter(Boolean)
      .join(" "),
  );

  const explicitStudioTerms = [
    "studio",
    "studios",
    "استوديو",
    "ستوديو",
  ];

  const explicitCreativeName = [
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
    "استوديو تسجيل",
    "ستوديو تسجيل",
  ].some((term) => nameText.includes(norm(term)));

  if (explicitCreativeName) return true;

  const hasStudioName = explicitStudioTerms.some((term) => nameText.includes(norm(term)));
  const relevantTaxonomy = [
    "music production",
    "recording",
    "podcast",
    "photography",
    "video production",
    "film production",
    "media production",
  ].some((term) => categoryText.includes(norm(term)));

  if (hasStudioName && relevantTaxonomy) return true;

  if (categoryText.includes("music production")) return true;
  if (categoryText.includes("recording studio")) return true;
  if (categoryText.includes("podcast studio")) return true;
  if (categoryText.includes("video production") && /studio|prod|production|film|video/i.test(name)) {
    return true;
  }

  if (categoryText.includes("photography")) {
    return /studio|photo|photograph|photographie|labo|image|focus|camera/i.test(name);
  }

  return false;
}

function addressInfo(props) {
  const addresses = listValue(props.addresses);
  const first = addresses.find((entry) => entry && typeof entry === "object") || {};

  return {
    freeform:
      typeof first.freeform === "string" && first.freeform.trim()
        ? first.freeform.trim()
        : null,
    locality:
      typeof first.locality === "string" && first.locality.trim()
        ? first.locality.trim()
        : null,
    postcode:
      typeof first.postcode === "string" && first.postcode.trim()
        ? first.postcode.trim()
        : null,
    region:
      typeof first.region === "string" && first.region.trim()
        ? first.region.trim()
        : null,
    country:
      typeof first.country === "string" && first.country.trim()
        ? first.country.trim().toUpperCase()
        : null,
  };
}

const records = [];

for (const feature of features) {
  const props = normalizedProperties(feature);
  const id =
    (typeof props.id === "string" && props.id.trim()) ||
    (typeof feature?.id === "string" && feature.id.trim()) ||
    null;
  const name = primaryName(props);
  const coordinates = feature?.geometry?.type === "Point"
    ? feature.geometry.coordinates
    : null;

  if (
    !id ||
    !name ||
    !Array.isArray(coordinates) ||
    coordinates.length < 2 ||
    !Number.isFinite(Number(coordinates[0])) ||
    !Number.isFinite(Number(coordinates[1]))
  ) {
    continue;
  }

  const taxonomy = taxonomyInfo(props);
  if (!isCreativeStudio(name, taxonomy)) continue;

  const sources = listValue(props.sources)
    .filter((entry) => entry && typeof entry === "object")
    .slice(0, 12)
    .map((entry) => ({
      dataset: typeof entry.dataset === "string" ? entry.dataset : null,
      provider: typeof entry.provider === "string" ? entry.provider : null,
      recordId:
        typeof entry.record_id === "string" || typeof entry.record_id === "number"
          ? String(entry.record_id)
          : null,
      updateTime: typeof entry.update_time === "string" ? entry.update_time : null,
      confidence: Number.isFinite(Number(entry.confidence))
        ? Number(entry.confidence)
        : null,
    }));

  records.push({
    id,
    name,
    taxonomy,
    confidence: Number.isFinite(Number(props.confidence))
      ? Number(props.confidence)
      : null,
    longitude: Number(coordinates[0]),
    latitude: Number(coordinates[1]),
    address: addressInfo(props),
    websites: listValue(props.websites).filter((value) => typeof value === "string").slice(0, 5),
    socials: listValue(props.socials).filter((value) => typeof value === "string").slice(0, 8),
    emails: listValue(props.emails).filter((value) => typeof value === "string").slice(0, 5),
    phones: listValue(props.phones).filter((value) => typeof value === "string").slice(0, 5),
    sources,
  });
}

records.sort((a, b) => {
  const byName = a.name.localeCompare(b.name, "en", { sensitivity: "base" });
  return byName || a.id.localeCompare(b.id);
});

const snapshot = {
  provider: "OVERTURE",
  release: "latest",
  generatedAt: new Date().toISOString(),
  bbox: {
    west: -7.75,
    south: 33.45,
    east: -7.45,
    north: 33.70,
  },
  totalPlacesInBbox: features.length,
  records,
};

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");

console.log(
  `D6 Overture snapshot wrote ${records.length} studio candidates from ${features.length} Casablanca places`,
);
console.log(
  records.slice(0, 30).map((record) => ({
    name: record.name,
    category: record.taxonomy.primary,
    confidence: record.confidence,
  })),
);
