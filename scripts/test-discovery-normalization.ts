import assert from "node:assert/strict";
import { DiscoveryStudioCategory } from "@prisma/client";

import {
  normalizeCandidateDraft,
  normalizeGeography,
  normalizeSearchText,
  normalizeStudioCategory,
} from "../lib/discovery/normalization";

assert.equal(
  normalizeSearchText("  Studio Écho — Casablanca  "),
  "studio echo casablanca",
);

assert.equal(
  normalizeSearchText("اِسْتُودْيُو النُّور"),
  "استوديو النور",
);

const recording = normalizeCandidateDraft({
  name: "  Studio Écho Casablanca ",
  providerCategory: "Recording Studio",
  countryCode: "ma",
  country: "Morocco",
  city: " Casablanca ",
  latitude: "33.5731104",
  longitude: "-7.5898434",
});
assert.equal(recording.name, "Studio Écho Casablanca");
assert.equal(recording.normalizedName, "studio echo casablanca");
assert.equal(recording.category, DiscoveryStudioCategory.RECORDING);
assert.equal(recording.categoryConfidence, "HIGH");
assert.equal(recording.countryCode, "MA");
assert.equal(recording.city, "Casablanca");
assert.equal(recording.latitude, 33.57311);
assert.equal(recording.longitude, -7.589843);
assert.deepEqual(recording.issues, []);

const podcast = normalizeStudioCategory({
  name: "Room 12",
  providerCategory: "Podcast Studio",
});
assert.equal(podcast.category, DiscoveryStudioCategory.PODCAST);

const photography = normalizeStudioCategory({
  name: "Frame Lab",
  tags: { category: "Photography Studio" },
});
assert.equal(photography.category, DiscoveryStudioCategory.PHOTO);

const rehearsal = normalizeStudioCategory({
  name: "Basement Sessions",
  providerCategory: "Band rehearsal room",
});
assert.equal(rehearsal.category, DiscoveryStudioCategory.REHEARSAL);

const voice = normalizeStudioCategory({
  name: "Dub House",
  providerCategory: "Voice-over studio",
});
assert.equal(voice.category, DiscoveryStudioCategory.VOICE_OVER);

const live = normalizeStudioCategory({
  name: "Stream Lab",
  providerCategory: "Live streaming studio",
});
assert.equal(live.category, DiscoveryStudioCategory.LIVE_STREAMING);

const post = normalizeStudioCategory({
  name: "Finish House",
  providerCategory: "Post-production / color grading",
});
assert.equal(post.category, DiscoveryStudioCategory.POST_PRODUCTION);

const arabic = normalizeCandidateDraft({
  name: "اِسْتُودْيُو النُّور",
  tags: { studio: "audio" },
  countryCode: "AE",
  country: "United Arab Emirates",
  city: "دبي",
  address: "شارع الشيخ زايد",
});
assert.equal(arabic.normalizedName, "استوديو النور");
assert.equal(arabic.category, DiscoveryStudioCategory.RECORDING);
assert.equal(arabic.city, "دبي");

const unresolved = normalizeStudioCategory({
  name: "Studio 21",
  providerCategory: "Studio",
});
assert.equal(unresolved.category, DiscoveryStudioCategory.OTHER);
assert.ok(unresolved.issues.includes("CATEGORY_UNRESOLVED"));

const invalidCoordinates = normalizeGeography({
  countryCode: "fr",
  country: "France",
  city: "Paris",
  latitude: 95,
  longitude: 2.3522,
});
assert.equal(invalidCoordinates.countryCode, "FR");
assert.equal(invalidCoordinates.latitude, null);
assert.equal(invalidCoordinates.longitude, null);
assert.ok(invalidCoordinates.issues.includes("LATITUDE_INVALID"));

const partialCoordinates = normalizeGeography({
  countryCode: "JP",
  city: "Tokyo",
  latitude: 35.6762,
});
assert.equal(partialCoordinates.latitude, null);
assert.equal(partialCoordinates.longitude, null);
assert.ok(partialCoordinates.issues.includes("COORDINATES_PARTIAL"));

const invalidCountry = normalizeGeography({
  countryCode: "MOR",
  country: "Morocco",
  city: "Rabat",
});
assert.equal(invalidCountry.countryCode, null);
assert.ok(invalidCountry.issues.includes("COUNTRY_CODE_INVALID"));

const globalAddress = normalizeGeography({
  countryCode: "br",
  country: "Brasil",
  region: "São Paulo",
  city: " São Paulo ",
  district: "Vila Madalena",
  postalCode: "05435-000",
  address: " Rua Harmonia, 100 ",
  latitude: -23.55052,
  longitude: -46.633308,
});
assert.equal(globalAddress.countryCode, "BR");
assert.equal(globalAddress.city, "São Paulo");
assert.equal(globalAddress.postalCode, "05435-000");
assert.equal(globalAddress.address, "Rua Harmonia, 100");

console.log("D3 discovery normalization fixtures passed");
