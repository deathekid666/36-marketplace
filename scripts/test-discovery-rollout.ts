import assert from "node:assert/strict";

import {
  DISCOVERY_ROLLOUT_SCOPES,
  discoveryRolloutScopes,
  isDiscoveryRolloutEnabled,
} from "../lib/discovery/rollout";

assert.equal(DISCOVERY_ROLLOUT_SCOPES.length, 1);

for (const capability of ["PUBLIC_DISCOVERY", "CLAIMS", "ONBOARDING"] as const) {
  assert.equal(isDiscoveryRolloutEnabled({ countryCode: "MA", city: "Casablanca" }, capability), true);
  assert.equal(isDiscoveryRolloutEnabled({ countryCode: "ma", city: "casablanca" }, capability), true);
  assert.equal(isDiscoveryRolloutEnabled({ countryCode: "MA", city: "Rabat" }, capability), false);
  assert.equal(isDiscoveryRolloutEnabled({ countryCode: "US", city: "Casablanca" }, capability), false);
  assert.equal(discoveryRolloutScopes(capability).length, 1);
}

assert.equal(
  isDiscoveryRolloutEnabled({ countryCode: null, city: null }, "PUBLIC_DISCOVERY"),
  false,
);

console.log("D14 controlled rollout fixtures passed");
