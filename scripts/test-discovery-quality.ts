import assert from "node:assert/strict";

import { assessDiscoveryQuality } from "../lib/discovery/quality";
import { isUnsafeDiscoveryProofUrl } from "../lib/discovery/security";

const now = new Date("2026-09-30T12:00:00Z");

const strong = assessDiscoveryQuality({
  name: "Atlas Recording Studio",
  normalizedName: "atlas recording studio",
  category: "RECORDING",
  countryCode: "MA",
  city: "Casablanca",
  address: "Maarif, Casablanca",
  latitude: 33.58,
  longitude: -7.63,
  phone: "+212600000000",
  website: "https://example.com",
  activeSourceCount: 2,
  lastCheckedAt: new Date("2026-09-29T12:00:00Z"),
});
assert.equal(strong.band, "STRONG");
assert.equal(strong.blockers.length, 0);
assert.ok(strong.score >= 75);

const weak = assessDiscoveryQuality({
  name: "X",
  normalizedName: "x",
  category: "OTHER",
  countryCode: null,
  city: null,
  address: null,
  latitude: null,
  longitude: null,
  phone: null,
  website: null,
  activeSourceCount: 0,
  lastCheckedAt: null,
});
assert.equal(weak.band, "WEAK");
assert.ok(weak.blockers.length >= 5);

assert.equal(isUnsafeDiscoveryProofUrl("http://127.0.0.1/admin"), true);
assert.equal(isUnsafeDiscoveryProofUrl("http://192.168.1.10/proof"), true);
assert.equal(isUnsafeDiscoveryProofUrl("http://localhost:3000"), true);
assert.equal(isUnsafeDiscoveryProofUrl("https://user:pass@example.com/proof"), true);
assert.equal(isUnsafeDiscoveryProofUrl("https://studio.example.com/about"), false);

console.log("D13 discovery quality/security fixtures passed", {
  strongScore: strong.score,
  weakScore: weak.score,
  referenceTime: now.toISOString(),
});
