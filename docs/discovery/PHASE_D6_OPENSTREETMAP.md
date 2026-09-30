# Phase D6 — First real discovery provider: OpenStreetMap

Date: 2026-09-30

## Current delivery architecture

D6 uses OpenStreetMap data, but the production application no longer depends on a live Overpass request.

The first implementation queried public Overpass instances directly from Vercel. Production probes from Vercel and GitHub-hosted cloud runners showed repeated timeouts / HTTP failures. The OpenStreetMap platform status currently documents temporary cloud-provider blocking and heavy-load workarounds affecting Overpass.

For a deterministic pilot, D6 now uses a free Morocco OpenStreetMap PBF extract and produces a small Casablanca-only snapshot in GitHub Actions.

Flow:

Morocco OSM PBF
-> GitHub Actions worker
-> Osmium Casablanca bbox extraction
-> Osmium studio tag filter
-> small JSON snapshot committed to the repository
-> 36 admin import
-> D3 normalization
-> D4 deduplication
-> CandidateStudio / CandidateStudioSource
-> D2 lifecycle

## OpenStreetMap source

The worker uses a Morocco OpenStreetMap country extract, preferring the OSM France mirror and retaining the exact source URL in the generated snapshot.

Current preferred pilot source:

https://download.openstreetmap.fr/extracts/africa/morocco-latest.osm.pbf

Fallback:

https://download-ext2.geofabrik.de/africa/morocco-latest.osm.pbf

License:

Open Database License 1.0 (ODbL)

Attribution retained:

© OpenStreetMap contributors

## Studio tags

The worker first exports named Casablanca map features, then keeps a conservative studio shortlist.

Direct structured matches:
- amenity=studio
- shop=photo_studio

It also keeps records whose public OSM name/description/brand/operator contains a studio-oriented term such as studio, recording studio, podcast studio, studio photo, studio vidéo, studio musique, or Arabic equivalents.

This wider shortlist is necessary because the Casablanca OSM extract currently contains no objects using the two dedicated studio tags. Ambiguous generic "studio" records are not trusted: D3 leaves unresolved categories as OTHER and D2 sends them to review rather than automatically approving them.

## Pilot geography

Casablanca bounding box:

- south 33.45
- west -7.75
- north 33.70
- east -7.45

The GitHub Actions worker first extracts this bbox from the Morocco PBF before filtering studio tags.

## Generated snapshot

Repository path:

data/discovery/osm/casablanca.json

The snapshot contains only the small provider subset needed by D6:

- OSM object type
- OSM object id
- point/derived center coordinates
- OSM tags
- snapshot generation timestamp
- source URL

No OpenStreetMap contributor usernames, user IDs or changeset IDs are stored.

## Admin import

/admin/discovery exposes an ADMIN-only "Import Casablanca snapshot" action.

Import outcomes remain:

- REFRESHED
- AUTO_MATCHED
- CREATED_REVIEW
- CREATED_ENRICHED

No provider record is automatically approved.

## Safety

- snapshot generation is isolated from Vercel request latency
- no production request downloads a 200+ MB country extract
- admin import remains rate-limited
- source-key refresh prevents duplicate provider rows
- D4 protects against unsafe merges
- D2 keeps approval human-controlled
- booking inventory remains isolated
- attribution/license data remains attached to every OSM source

## Booking isolation

Importing the snapshot cannot create:

- User
- Studio
- Room
- availability
- Booking
- Payment
- Payout

The highest automated state is ENRICHED.

## Database

D6 requires no database migration.
