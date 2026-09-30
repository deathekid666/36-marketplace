# Phase D11 — Provider-by-provider expansion

Date: 2026-09-30

## Goal

D11 makes discovery provider expansion explicit instead of treating every external dataset as interchangeable.

Providers are connected one at a time and keep separate source identities.

## Configured providers

### Overture Maps

Role: PRIMARY

Delivery:
- controlled Casablanca repository snapshot
- normalized through D3
- deduplicated through D4
- imported through the admin workspace

Production already contains Overture source rows.

### OpenStreetMap

Role: SECONDARY

Delivery:
- Morocco OSM PBF
- Casablanca extraction
- repository snapshot
- normalized/deduplicated through the same ingestion path

The current committed Casablanca OSM snapshot contains zero studio elements.

That is treated as an empty provider snapshot, not evidence that existing candidates should be deleted or closed.

The admin import control is therefore disabled until a future snapshot contains candidates.

## Provider registry

lib/discovery/providers/registry.ts is the canonical list of active provider integrations.

It records:
- provider key
- display label
- primary/secondary role
- delivery mechanism
- attribution
- license URL
- operating notes

## Admin workspace

/admin/discovery now shows each provider independently with:
- provider role
- snapshot timestamp
- snapshot record count
- number of source rows already stored
- provider-specific import control

Import result/error messages are provider-aware.

Each provider has its own rate-limit bucket.

## Ingestion isolation

A new provider record still becomes CandidateStudioSource evidence first.

Providers do not directly:
- approve a candidate
- overwrite an owner-controlled Studio
- create rooms
- create availability
- create bookings
- create payments

D4 decides safe cross-provider matching.

## Empty snapshot rule

An empty snapshot is a no-op.

It never marks previous sources inactive and never archives candidates.

D12 introduces explicit staleness/refresh policy instead of inferring deletion from one missing provider run.

## Database

D11 requires no database migration.
