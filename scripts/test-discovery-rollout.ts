import assert from "node:assert/strict";

import {
  DISCOVERY_ROLLOUT_SCOPES,
  GLOBAL_PUBLIC_CONTACT_DIRECTORY,
  discoveryRolloutScopes,
  isDiscoveryRolloutEnabled,
} from "../lib/discovery/rollout";

assert.equal(DISCOVERY_ROLLOUT_SCOPES.length, 1);
assert.equal(GLOBAL_PUBLIC_CONTACT_DIRECTORY, true);

assert.equal(
  isDiscoveryRolloutEnabled({ countryCode: "MA", city: "Casablanca" }, "PUBLIC_DISCOVERY"),
  true,
);
assert.equal(
  isDiscoveryRolloutEnabled({ countryCode: "US", city: "New York" }, "PUBLIC_DISCOVERY"),
  true,
);
assert.equal(
  isDiscoveryRolloutEnabled({ countryCode: "JP", city: "Tokyo" }, "PUBLIC_DISCOVERY"),
  true,
);
assert.equal(
  isDiscoveryRolloutEnabled({ countryCode: null, city: "Paris" }, "PUBLIC_DISCOVERY"),
  false,
);

for (const capability of ["CLAIMS", "ONBOARDING"] as const) {
  assert.equal(isDiscoveryRolloutEnabled({ countryCode: "MA", city: "Casablanca" }, capability), true);
  assert.equal(isDiscoveryRolloutEnabled({ countryCode: "ma", city: "casablanca" }, capability), true);
  assert.equal(isDiscoveryRolloutEnabled({ countryCode: "MA", city: "Rabat" }, capability), false);
  assert.equal(isDiscoveryRolloutEnabled({ countryCode: "US", city: "New York" }, capability), false);
  assert.equal(discoveryRolloutScopes(capability).length, 1);
}

console.log("D14 controlled rollout fixtures passed");
