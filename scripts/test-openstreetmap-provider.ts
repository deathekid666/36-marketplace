import assert from "node:assert/strict";
import { DiscoveryStudioCategory } from "@prisma/client";

import {
  buildOpenStreetMapStudioQuery,
  OSM_SCAN_PRESETS,
  parseOpenStreetMapStudioResponse,
} from "../lib/discovery/providers/openstreetmap";

const context = OSM_SCAN_PRESETS.CASABLANCA;

const query = buildOpenStreetMapStudioQuery(context.bounds);
assert.ok(query.includes('nwr["amenity"="studio"]'));
assert.ok(query.includes('nwr["shop"="photo_studio"]'));
assert.ok(query.includes("33.45,-7.75,33.7,-7.45"));
assert.ok(query.includes("[timeout:20]"));

const parsed = parseOpenStreetMapStudioResponse(
  {
    elements: [
      {
        type: "node",
        id: 101,
        lat: 33.57311,
        lon: -7.589843,
        timestamp: "2026-09-29T08:00:00Z",
        tags: {
          name: "Studio Écho",
          amenity: "studio",
          studio: "audio",
          "addr:street": "Rue Example",
          "addr:housenumber": "12",
          "addr:city": "Casablanca",
          phone: "+212 5 22 00 11 22",
          website: "https://studioecho.ma",
        },
      },
      {
        type: "way",
        id: 202,
        center: { lat: 33.58, lon: -7.60 },
        tags: {
          name: "Frame Lab",
          shop: "photo_studio",
          "addr:suburb": "Maarif",
          "contact:instagram": "@framelab",
        },
      },
      {
        type: "node",
        id: 303,
        lat: 33.59,
        lon: -7.61,
        tags: {
          amenity: "studio",
          studio: "video",
        },
      },
      {
        type: "relation",
        id: 404,
        center: { lat: 33.60, lon: -7.62 },
        tags: {
          name: "Generic Media House",
          amenity: "studio",
        },
      },
    ],
  },
  context,
);

assert.equal(parsed.rawElementCount, 4);
assert.equal(parsed.skippedWithoutName, 1);
assert.equal(parsed.records.length, 3);

const audio = parsed.records[0];
assert.equal(audio.sourceKey, "osm:node:101");
assert.equal(audio.externalId, "node/101");
assert.equal(audio.category, DiscoveryStudioCategory.RECORDING);
assert.equal(audio.countryCode, "MA");
assert.equal(audio.city, "Casablanca");
assert.equal(audio.address, "12 Rue Example");
assert.equal(audio.osmTimestamp, "2026-09-29T08:00:00Z");
assert.equal(audio.issues.length, 0);

const photo = parsed.records[1];
assert.equal(photo.sourceKey, "osm:way:202");
assert.equal(photo.category, DiscoveryStudioCategory.PHOTO);
assert.equal(photo.district, "Maarif");
assert.equal(photo.instagram, "@framelab");
assert.equal(photo.countryCode, "MA");

const generic = parsed.records[2];
assert.equal(generic.category, DiscoveryStudioCategory.OTHER);
assert.ok(generic.issues.includes("CATEGORY_UNRESOLVED"));

assert.throws(
  () =>
    buildOpenStreetMapStudioQuery({
      south: 0,
      west: 0,
      north: 2,
      east: 2,
    }),
  /OSM_BOUNDS_TOO_LARGE/,
);

assert.throws(
  () =>
    buildOpenStreetMapStudioQuery({
      south: 33.7,
      west: -7.4,
      north: 33.4,
      east: -7.8,
    }),
  /OSM_BOUNDS_INVALID/,
);

console.log("D6 OpenStreetMap provider fixtures passed");
