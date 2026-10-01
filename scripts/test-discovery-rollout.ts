import assert from "node:assert/strict";

import {
  DISCOVERY_ROLLOUT_SCOPES,
  GLOBAL_DIRECTORY_CLAIMS,
  GLOBAL_PUBLIC_CONTACT_DIRECTORY,
  discoveryRolloutScopes,
  isDiscoveryRolloutEnabled,
} from "../lib/discovery/rollout";

assert.equal(DISCOVERY_ROLLOUT_SCOPES.length, 1);
assert.equal(GLOBAL_PUBLIC_CONTACT_DIRECTORY, true);
assert.equal(GLOBAL_DIRECTORY_CLAIMS, true);

assert.equal(
  isDiscoveryRolloutEnabled(
    { countryCode: "MA", city: "Casablanca" },
    "PUBLIC_DISCOVERY",
  ),
  true,
);
assert.equal(
  isDiscoveryRolloutEnabled(
    { countryCode: "US", city: "New York" },
    "PUBLIC_DISCOVERY",
  ),
  true,
);
assert.equal(
  isDiscoveryRolloutEnabled(
    { countryCode: "JP", city: "Tokyo" },
    "PUBLIC_DISCOVERY",
  ),
  true,
);
assert.equal(
  isDiscoveryRolloutEnabled(
    { countryCode: null, city: "Paris" },
    "PUBLIC_DISCOVERY",
  ),
  false,
);

// Ownership claiming is global for candidates with a valid two-letter country code.
for (const location of [
  { countryCode: "MA", city: "Casablanca" },
  { countryCode: "ma", city: "Rabat" },
  { countryCode: "US", city: "New York" },
  { countryCode: "JP", city: "Tokyo" },
]) {
  assert.equal(
    isDiscoveryRolloutEnabled(location, "CLAIMS"),
    true,
  );
}
assert.equal(
  isDiscoveryRolloutEnabled(
    { countryCode: null, city: "Paris" },
    "CLAIMS",
  ),
  false,
);

// Converting a claimed directory profile into a bookable marketplace Studio
// remains limited to the explicit onboarding allow-list.
assert.equal(
  isDiscoveryRolloutEnabled(
    { countryCode: "MA", city: "Casablanca" },
    "ONBOARDING",
  ),
  true,
);
assert.equal(
  isDiscoveryRolloutEnabled(
    { countryCode: "ma", city: "casablanca" },
    "ONBOARDING",
  ),
  true,
);
assert.equal(
  isDiscoveryRolloutEnabled(
    { countryCode: "MA", city: "Rabat" },
    "ONBOARDING",
  ),
  false,
);
assert.equal(
  isDiscoveryRolloutEnabled(
    { countryCode: "US", city: "New York" },
    "ONBOARDING",
  ),
  false,
);
assert.equal(discoveryRolloutScopes("ONBOARDING").length, 1);

console.log("D14 controlled rollout fixtures passed");
