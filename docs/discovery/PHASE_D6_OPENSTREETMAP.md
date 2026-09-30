# Phase D6 — First real discovery provider: OpenStreetMap

Date: 2026-09-30

## Provider choice

D6 connects OpenStreetMap data through the read-only Overpass API.

Why this provider is first:

- global map coverage
- no proprietary place-id lock-in
- OSM explicitly supports reuse with attribution under ODbL
- studio-specific tags exist for recording/video/radio/television studios
- photo studios have a dedicated shop=photo_studio tag
- no API key is required for the initial controlled pilot

The Overpass endpoint is configurable with OVERPASS_API_URL.

Default:
https://overpass.private.coffee/api/interpreter

For scale, 36 must move to a controlled/self-hosted/paid data path rather than assuming a community endpoint is permanent infrastructure.

## OSM tags queried

The pilot query is intentionally high precision:

- amenity=studio
- shop=photo_studio

The adapter also reads studio=* when present.

Examples:

- amenity=studio + studio=audio -> recording
- amenity=studio + studio=video -> video
- amenity=studio + studio=television -> video
- amenity=studio + studio=radio -> recording-oriented candidate
- shop=photo_studio -> photo

A generic amenity=studio with no usable type remains OTHER and goes to review rather than being guessed.

## Pilot geography

D6 exposes only one controlled scan preset:

CASABLANCA

Bounding box:
- south 33.45
- west -7.75
- north 33.70
- east -7.45

The provider module supports arbitrary validated bounding boxes, but the admin UI cannot submit arbitrary coordinates in D6.

This is deliberate. Multi-city/country rollout remains D14.

## Import flow

Manual ADMIN action:

OpenStreetMap / Overpass
-> parse provider records
-> D3 normalization
-> exact source-key refresh check
-> D4 deduplication
-> CandidateStudio / CandidateStudioSource
-> D2 lifecycle transition

Outcomes:

### REFRESHED
The exact OSM sourceKey already exists. Source freshness timestamps are updated. Canonical candidate fields are not silently overwritten.

### AUTO_MATCHED
D4 finds one strong existing candidate. The OSM source is attached to it.

### CREATED_REVIEW
A new isolated candidate is created and moved to REVIEW_REQUIRED because:
- D4 found an ambiguous possible duplicate, or
- D3 reported unresolved/low-confidence normalization issues.

### CREATED_ENRICHED
A new isolated candidate passes D3 quality checks and is moved from DISCOVERED to ENRICHED.

No provider record is automatically APPROVED.

## Evidence retained

CandidateStudioSource stores:

- provider
- sourceKey
- externalId
- source URL
- provider category
- attribution
- ODbL/copyright URL
- collected timestamp
- last checked timestamp

Transition metadata stores the OSM tags and normalization/dedup evidence used during first ingestion.

The admin candidate detail page exposes lifecycle metadata for audit.

## Provider safeguards

- ADMIN-only manual scans
- four scans per admin per hour
- one predefined small bounding box
- maximum 1 degree span enforced by provider query builder
- 20 second Overpass query timeout
- 22 second client abort
- 20 MB Overpass-side maxsize
- 5 MB response guard
- maximum 250 parsed records per scan
- no parallel provider requests
- no cron
- no automatic retry after provider throttling
- HTTPS-only configurable endpoint
- identifying User-Agent and Referer

## Licensing

OSM data is licensed under the Open Data Commons Open Database License (ODbL).

Each stored OSM source carries:

© OpenStreetMap contributors

and links to:

https://www.openstreetmap.org/copyright

D6 does not remove or replace source attribution.

Before public discovered pages are released in D7, OSM attribution must remain visible wherever OSM-derived discovery data is presented.

## Booking isolation

Importing OSM records cannot create:

- User
- Studio
- Room
- availability
- Booking
- Payment
- Payout

The highest automated lifecycle state created by D6 is ENRICHED.

Human approval is still required later.

## Database

D6 requires no database migration.
