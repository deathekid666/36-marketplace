# Phase D3 — Category and geographic normalization

Date: 2026-09-30

## Purpose

D3 creates a provider-neutral normalization layer before any external studio API is connected.

External providers will not be allowed to write their raw category or geographic values directly into CandidateStudio.

## Category normalization

The canonical discovery taxonomy remains:

- RECORDING
- PODCAST
- PHOTO
- VIDEO
- REHEARSAL
- DJ
- PRODUCTION
- VOICE_OVER
- LIVE_STREAMING
- POST_PRODUCTION
- OTHER

Normalization can use three evidence sources:

1. provider category
2. provider tags
3. candidate name

Evidence priority is intentionally:

provider category > structured tags > name text

The result includes:
- canonical category
- HIGH / MEDIUM / LOW confidence
- evidence markers
- alternative matches
- explicit issues for unresolved or ambiguous categories

Generic words such as "studio" do not force a category.

Ambiguous top matches resolve to OTHER rather than guessing.

## Geographic normalization

D3 normalizes:

- countryCode
- country
- region
- city
- district
- postalCode
- address
- latitude
- longitude

Rules:

- country codes must already be two-letter codes; D3 uppercases them
- D3 never guesses a country code from a country name
- display strings preserve Unicode and accents
- matching text uses Unicode normalization and removes combining marks
- Arabic and other non-Latin scripts remain searchable instead of being discarded
- latitude must be between -90 and 90
- longitude must be between -180 and 180
- partial coordinate pairs are rejected as a pair
- valid coordinates are rounded to six decimal places to match the database precision
- postal codes remain strings so leading zeros are preserved

## Why country inference is deliberately absent

Provider adapters must provide an ISO-like two-letter country code when they know it.

Trying to infer a country from free-form text inside the shared normalizer would create silent global data errors. A missing/invalid country code therefore remains unresolved and cannot pass the D2 ENRICHED/APPROVED quality gate.

## Candidate normalization result

normalizeCandidateDraft() returns normalized candidate data plus issue codes.

It does not:
- write to the database
- change lifecycle state
- call an external API
- create a Studio
- create booking inventory

This keeps D3 deterministic and testable.

## Fixture coverage

The D3 fixture suite covers:
- Moroccan recording studio
- podcast
- photography
- rehearsal
- voice-over
- live streaming
- post-production
- Arabic text
- ambiguous/unresolved studio category
- invalid latitude
- partial coordinates
- invalid country code
- Brazilian Unicode address/postal data

The fixture suite is executed in CI before the Next.js production build.

## No database migration

D3 uses the fields already created in D1.

There is intentionally no D3 database migration.
