# Global public studio contact directory

Date: 2026-09-30

## Goal

36 now supports a worldwide contact-only discovery directory.

The directory is intentionally separate from the bookable marketplace.

Imported businesses may expose:
- studio name
- public business phone
- public website
- city/country/address
- map coordinates
- provider/source attribution

They do not receive:
- rooms
- prices
- availability
- reviews
- payments
- booking capability

## Global source

The first global contact source is Overture Maps Places.

The global pipeline selects public place records that:
- have at least one provider phone number
- look like a creative studio by taxonomy/name
- have a country code and geographic point
- are not known as closed by the source

The app stores the first public phone as the canonical directory phone.
The provider metadata retains up to five public phone values for audit.

## Trust levels

ENRICHED candidate:
- provider-sourced public contact
- visible in the global directory when it has a public phone
- not independently verified by 36
- never bookable

APPROVED candidate:
- reviewed discovery contact
- still not bookable

CONVERTED candidate:
- owner onboarding has started
- still not bookable until the linked Studio becomes VERIFIED

Once a converted Studio becomes VERIFIED, discovery links redirect to the real bookable Studio.

## Global visibility vs claims

PUBLIC_DISCOVERY is global for contact-only records.

CLAIMS and ONBOARDING remain controlled by the existing rollout allow-list.
At the time of this change they remain enabled only for Casablanca, Morocco.

This prevents global contact ingestion from silently turning into global booking.

## Import authentication

The global importer does not use an exposed shared API key.

GitHub Actions obtains a short-lived GitHub OIDC token.
The production ingestion endpoint verifies:
- GitHub issuer
- dedicated audience
- repository
- main branch ref
- exact workflow file
- allowed event type
- token issue/expiry times
- RS256 signature against GitHub's published JWKS

The endpoint also applies strict request and batch-size limits.

## Contact refresh

When an already-known provider source is seen again, 36 refreshes freshness timestamps and fills missing public contact/location fields without overwriting an existing non-empty canonical value.

## Provider limitations

This is a public-data directory, not a guarantee of every studio on Earth.

No provider contains every business, and phone data may be missing, stale, or incorrect.

The UI therefore labels provider-only contacts as unverified and retains source attribution.
