# Phase D4 — Conservative cross-provider deduplication

Date: 2026-09-30

## Purpose

D4 decides whether a newly discovered provider record is likely to represent an existing CandidateStudio.

The primary design goal is avoiding false merges.

Two real studios may share:
- a building
- a generic name
- a brand website
- a phone number
- a social account
- a city
- a category

For that reason no single weak field can silently merge records.

## Decisions

The engine returns one of:

### AUTO_MATCH
Evidence is strong enough to attach a new provider source to an existing candidate automatically.

### REVIEW
The records may represent the same physical studio, but human or later evidence is required.

### DISTINCT
The records should remain separate.

## Evidence

The engine evaluates:

- normalized studio name
- website host
- Instagram handle
- phone digits
- country
- city
- district
- postal code
- normalized address
- coordinates / physical distance
- category

Website, Instagram and phone are strong identity signals.

Names and categories are not sufficient on their own.

## Conservative automatic matching

AUTO_MATCH requires:
- score >= 80
- meaningful name similarity
- no hard geographic conflict
- and one of:
  - at least two independent strong identity matches
  - one strong identity plus strong location evidence
  - near-exact name plus coordinates within 80 metres

This means an exact name in the same city is still REVIEW rather than AUTO_MATCH.

## Branch / chain protection

A website, phone number or social account may be shared across branches.

If two records are at least 10 km apart and do not have a strongly matching address, the result is DISTINCT even when identity signals match.

Country mismatch is also immediately DISTINCT.

## Same-building protection

Coordinates alone never prove identity.

Two differently named businesses in the same building are not automatically merged.

## Ambiguous winner protection

chooseDedupMatch() compares an incoming record with a shortlist of candidates.

If two existing candidates are similarly plausible, the engine downgrades the result to REVIEW and returns no automatic winner.

This prevents one source record from being silently attached to the wrong candidate.

## Blocking keys

buildCandidateBlockingKeys() generates deterministic shortlist keys for later ingestion:

- website host
- Instagram handle
- normalized phone digits
- country + city + significant name
- approximate coordinate cell

These keys reduce future comparison volume but do not themselves cause a merge.

## Data safety

D4 does not:
- write to CandidateStudio
- attach CandidateStudioSource
- change lifecycle status
- create Studio
- create Room
- create Booking
- call external APIs

The engine is pure and deterministic.

Provider ingestion will consume it in a later phase.

## Tests

D4 fixtures cover:
- same studio across differently formatted provider records
- same-brand branches far apart
- two businesses in the same building
- one strong identity without strong location
- two independent identity signals
- country mismatch
- close name + coordinates
- same name/city with no strong identity
- Arabic Unicode normalization
- ambiguous candidate selection
- clear candidate selection
- blocking keys
- social-network URLs excluded as website identity

No database migration is required for D4.
