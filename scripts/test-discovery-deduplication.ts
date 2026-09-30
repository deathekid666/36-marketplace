import assert from "node:assert/strict";
import { DiscoveryStudioCategory } from "@prisma/client";

import {
  buildCandidateBlockingKeys,
  chooseDedupMatch,
  distanceMetersBetween,
  evaluateDedupCandidate,
  nameSimilarity,
} from "../lib/discovery/deduplication";

const base = {
  id: "candidate-a",
  name: "Studio Écho",
  normalizedName: "studio echo",
  category: DiscoveryStudioCategory.RECORDING,
  countryCode: "MA",
  city: "Casablanca",
  district: "Maarif",
  address: "12 Rue Example, Maarif",
  latitude: 33.57311,
  longitude: -7.589843,
  phone: "+212 5 22 00 11 22",
  website: "https://www.studioecho.ma/",
  instagram: "@studioecho",
};

const sameAcrossProvider = evaluateDedupCandidate(
  {
    name: "Echo Recording Studio",
    category: DiscoveryStudioCategory.RECORDING,
    countryCode: "ma",
    city: "CASABLANCA",
    address: "12 rue example maarif",
    latitude: 33.5732,
    longitude: -7.5898,
    phone: "00212 5 22 00 11 22",
    website: "https://studioecho.ma?utm_source=provider",
    instagram: "https://instagram.com/studioecho/",
  },
  base,
);
assert.equal(sameAcrossProvider.decision, "AUTO_MATCH");
assert.ok(sameAcrossProvider.strongIdentityMatches >= 2);
assert.ok((sameAcrossProvider.distanceMeters || Infinity) < 80);

const sameBrandDifferentBranch = evaluateDedupCandidate(
  {
    name: "Studio Écho",
    category: DiscoveryStudioCategory.RECORDING,
    countryCode: "MA",
    city: "Casablanca",
    address: "200 Boulevard Another",
    latitude: 33.6501,
    longitude: -7.6101,
    phone: "+212 5 22 00 11 22",
    website: "studioecho.ma",
    instagram: "@studioecho",
  },
  base,
);
assert.equal(sameBrandDifferentBranch.decision, "DISTINCT");
assert.ok(sameBrandDifferentBranch.conflicts.includes("COORDINATES_FAR_APART"));

const sameBuildingDifferentBusiness = evaluateDedupCandidate(
  {
    name: "Atlas Podcast Lab",
    category: DiscoveryStudioCategory.PODCAST,
    countryCode: "MA",
    city: "Casablanca",
    address: "12 Rue Example, Maarif",
    latitude: 33.57312,
    longitude: -7.58984,
  },
  base,
);
assert.notEqual(sameBuildingDifferentBusiness.decision, "AUTO_MATCH");

const oneIdentityWithoutStrongLocation = evaluateDedupCandidate(
  {
    name: "Studio Echo Casablanca",
    category: DiscoveryStudioCategory.RECORDING,
    countryCode: "MA",
    city: "Casablanca",
    instagram: "@studioecho",
  },
  base,
);
assert.equal(oneIdentityWithoutStrongLocation.decision, "REVIEW");

const twoIndependentIdentities = evaluateDedupCandidate(
  {
    name: "Echo Studio",
    category: DiscoveryStudioCategory.RECORDING,
    countryCode: "MA",
    city: "Casablanca",
    phone: "212522001122",
    instagram: "@studioecho",
  },
  base,
);
assert.equal(twoIndependentIdentities.decision, "AUTO_MATCH");

const countryMismatch = evaluateDedupCandidate(
  {
    name: "Studio Echo",
    countryCode: "FR",
    city: "Paris",
    website: "studioecho.ma",
    phone: "212522001122",
  },
  base,
);
assert.equal(countryMismatch.decision, "DISTINCT");
assert.deepEqual(countryMismatch.conflicts, ["COUNTRY_MISMATCH"]);

const closeNameAndCoordinatesOnly = evaluateDedupCandidate(
  {
    name: "Studio Echo",
    category: DiscoveryStudioCategory.RECORDING,
    countryCode: "MA",
    city: "Casablanca",
    latitude: 33.57313,
    longitude: -7.58982,
  },
  base,
);
assert.equal(closeNameAndCoordinatesOnly.decision, "AUTO_MATCH");

const sameNameSameCityNoStrongIdentity = evaluateDedupCandidate(
  {
    name: "Studio Écho",
    category: DiscoveryStudioCategory.RECORDING,
    countryCode: "MA",
    city: "Casablanca",
  },
  base,
);
assert.equal(sameNameSameCityNoStrongIdentity.decision, "REVIEW");

const arabicNameScore = nameSimilarity("اِسْتُودْيُو النُّور", "استوديو النور");
assert.equal(arabicNameScore, 1);

const shortDistance = distanceMetersBetween(
  { latitude: 33.57311, longitude: -7.589843 },
  { latitude: 33.5732, longitude: -7.5898 },
);
assert.ok(shortDistance != null && shortDistance < 20);

const ambiguousSelection = chooseDedupMatch(
  {
    name: "Echo Recording Studio",
    category: DiscoveryStudioCategory.RECORDING,
    countryCode: "MA",
    city: "Casablanca",
    phone: "212522001122",
    instagram: "@studioecho",
  },
  [
    base,
    {
      ...base,
      id: "candidate-b",
      address: "14 Rue Example, Maarif",
      latitude: 33.5732,
      longitude: -7.5897,
    },
  ],
);
assert.equal(ambiguousSelection.decision, "REVIEW");
assert.equal(ambiguousSelection.candidateId, null);
assert.equal(ambiguousSelection.ambiguousCandidateIds.length, 2);

const clearSelection = chooseDedupMatch(
  {
    name: "Echo Recording Studio",
    category: DiscoveryStudioCategory.RECORDING,
    countryCode: "MA",
    city: "Casablanca",
    address: "12 Rue Example, Maarif",
    latitude: 33.57312,
    longitude: -7.58984,
    phone: "212522001122",
    website: "studioecho.ma",
  },
  [
    base,
    {
      id: "candidate-far",
      name: "Echo Studio",
      countryCode: "MA",
      city: "Rabat",
      latitude: 34.0209,
      longitude: -6.8416,
      website: "other-echo.example",
    },
  ],
);
assert.equal(clearSelection.decision, "AUTO_MATCH");
assert.equal(clearSelection.candidateId, "candidate-a");

const keys = buildCandidateBlockingKeys(base);
assert.ok(keys.includes("web:studioecho.ma"));
assert.ok(keys.includes("ig:studioecho"));
assert.ok(keys.includes("phone:212522001122"));
assert.ok(keys.some((value) => value.startsWith("geo-name:MA:casablanca:")));
assert.ok(keys.some((value) => value.startsWith("cell:MA:")));

const socialWebsiteIgnored = buildCandidateBlockingKeys({
  name: "Social-only",
  countryCode: "MA",
  city: "Casablanca",
  website: "https://instagram.com/socialonly",
});
assert.ok(!socialWebsiteIgnored.some((value) => value.startsWith("web:instagram.com")));

console.log("D4 discovery deduplication fixtures passed");
