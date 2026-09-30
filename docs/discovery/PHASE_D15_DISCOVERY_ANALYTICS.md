# Phase D15 — Discovery analytics and business metrics

Date: 2026-09-30

## Goal

D15 makes the discovery funnel measurable without weakening any trust or booking rule.

## New tracked events

MarketplaceEvent now accepts:

- DISCOVERY_CLAIM_SUBMITTED
- DISCOVERY_CLAIM_VERIFIED
- DISCOVERY_CLAIM_REJECTED
- DISCOVERY_ONBOARDING_STARTED

Existing D10 event remains:

- DISCOVERY_SEARCH_IMPRESSION

Event tracking is best-effort and never controls the core claim/onboarding transaction.

## Admin analytics

/admin/analytics now includes a Discovery pipeline section with:

- total candidates
- approved candidates
- converted candidates
- claim counts by status
- provider source counts
- 30-day discovery search impressions
- 30-day discovery claim/onboarding events
- snapshot funnel ratios

The ratios are descriptive snapshots, not forecasts:

- approved-or-converted candidates / all candidates
- verified claims / decided claims
- converted candidates / verified claims

## Provider metrics

Source rows are grouped by provider so admins can compare how much evidence each provider contributes.

This is not a provider quality ranking. Evidence quality remains candidate-specific under D13.

## Event metadata

Claim events store IDs and workflow context in MarketplaceEvent.metadata.

No passwords, proof contents or private claim evidence are copied into analytics metadata.

## Privacy / trust boundary

Discovery analytics does not expose claimant evidence publicly.

Analytics does not:
- approve candidates
- verify claims
- create Studios
- create bookings
- alter provider freshness

## Automated tests

scripts/test-discovery-analytics.ts verifies the descriptive snapshot-ratio calculations and zero-denominator behavior.

## Database

D15 reuses the existing MarketplaceEvent model and requires no database migration.
