# Phase D14 — Controlled city/country rollout

Date: 2026-09-30

## Goal

D14 separates provider coverage from product launch coverage.

A provider may discover studios anywhere. That does not automatically mean 36 should expose, claim or onboard them.

## Launch allow-list

The canonical rollout configuration is:

`lib/discovery/rollout.ts`

Initial scope:

- country: MA
- city: Casablanca
- public discovery: enabled
- studio claims: enabled
- owner onboarding: enabled

No other city or country is launched by default.

## Capabilities

Each scope independently controls:

- PUBLIC_DISCOVERY
- CLAIMS
- ONBOARDING

This allows future expansion in stages. For example, 36 can make a city visible for discovery before allowing ownership claims or bookable onboarding.

## Enforcement

The rollout guard is enforced server-side in:

- /discover
- /discover/[slug]
- unified /studios discovery suggestions
- /discover/[slug]/claim
- claim submission backend
- verified-claim onboarding conversion

It is not just a UI filter.

## Admin behavior

/admin/discovery remains global and can review provider candidates outside launch markets.

The admin workspace displays active launch scopes separately from provider coverage.

## Booking safety

The existing booking marketplace remains unchanged.

Only a verified 36 Studio is bookable.

D14 also centralizes the earlier D9 Morocco-only conversion guard. Current onboarding is specifically Casablanca, Morocco while the booking engine still assumes MAD and Casablanca time.

## Expansion procedure

To launch another city:

1. confirm provider evidence quality
2. add an explicit rollout scope
3. choose which capabilities are enabled
4. pass CI/build
5. deploy
6. verify public search and claims in that city

There is no automatic global launch.

## Automated tests

`scripts/test-discovery-rollout.ts` verifies:

- Casablanca + MA is enabled for all current capabilities
- matching is case-insensitive
- Rabat is not launched
- another country is not launched
- missing location data is not launched

## Database

D14 requires no database migration.
