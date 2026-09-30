# Phase D6 — First active discovery provider: Overture Maps Places

Date: 2026-09-30

## Why the provider changed

The first D6 implementation tested OpenStreetMap through Overpass.

The application-side parsing, normalization and safety pipeline worked, but current public Overpass access from Vercel and GitHub-hosted cloud runners was unreliable, and the Casablanca OSM extract contained no dedicated amenity=studio or shop=photo_studio features. A broader OSM name scan still produced no usable creative-studio candidates.

D6 therefore activates Overture Maps Places as the first production discovery provider.

OpenStreetMap support remains available as a future supplemental source.

## Why Overture

Overture Places provides tens of millions of normalized real-world place records globally, assembled from multiple sources including Meta, Microsoft, Foursquare and other contributors.

For the Casablanca pilot, the current snapshot contains a filtered creative-studio shortlist from more than 25,000 local Overture places.

The dataset provides useful discovery evidence such as:

- stable Overture/GERS IDs
- names
- taxonomy
- confidence
- coordinates
- address
- websites
- social links
- emails
- phone numbers
- underlying source metadata

## Licensing

The Overture Places theme is published under permissive licenses including CDLA Permissive 2.0, Apache 2.0 and CC0 depending on the contributing source.

36 stores:

- provider = OVERTURE
- external Overture ID
- Overture attribution
- link to Overture attribution/licensing documentation
- provider source metadata in lifecycle evidence

Reference:

https://docs.overturemaps.org/attribution/

## Pilot geography

Casablanca bounding box:

- west -7.75
- south 33.45
- east -7.45
- north 33.70

## Snapshot generation

GitHub Actions uses the official Overture Python client:

overturemaps download --bbox=-7.75,33.45,-7.45,33.70 --type=place -f geojson

The worker then keeps only a conservative studio-oriented shortlist.

Primary signals include:

- music_production taxonomy
- recording/podcast/video/film production taxonomy
- photography taxonomy combined with studio/photo/lab-like business names
- explicit studio-oriented business names

The generated snapshot is:

data/discovery/overture/casablanca.json

No country-scale dataset is shipped to Vercel.

## Production import

ADMIN import flow:

Overture snapshot
-> provider adapter
-> D3 normalization
-> exact source-key refresh
-> D4 deduplication
-> CandidateStudio / CandidateStudioSource
-> D2 lifecycle

Possible outcomes:

- REFRESHED
- AUTO_MATCHED
- CREATED_REVIEW
- CREATED_ENRICHED

Nothing is automatically APPROVED.

Records with unresolved normalization or low provider confidence are sent to REVIEW_REQUIRED.

## Booking isolation

Overture import cannot create:

- User
- Studio
- Room
- availability
- Booking
- Payment
- Payout

The provider layer remains completely isolated from bookable inventory.

## Database

D6 requires no new database migration.
