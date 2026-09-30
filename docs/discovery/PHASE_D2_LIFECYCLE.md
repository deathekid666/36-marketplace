# Phase D2 — Candidate lifecycle rules

Date: 2026-09-30

## Purpose

D2 defines how a discovered studio can change state before any external discovery provider is connected.

The discovery lifecycle remains separate from the existing 36 booking lifecycle.

A candidate studio is never bookable.

## Candidate states

### DISCOVERED
A provider or manual source has produced a candidate record.

This is the initial state.

The record may still be incomplete, ambiguous, duplicated, or incorrectly categorized.

### ENRICHED
The candidate has enough normalized information to be considered structurally usable.

Minimum D2 quality gate:
- usable name
- usable normalized name
- category is not OTHER
- ISO-like two-letter country code
- at least one location signal: coordinates, city, or address
- at least one active source record

ENRICHED does not mean approved for public display.

### REVIEW_REQUIRED
The candidate needs human review because of ambiguity, conflicting evidence, possible duplication, stale evidence, or another quality concern.

Automated logic may send records into this state but cannot resolve the review.

### APPROVED
An active admin has approved the candidate for a later public unclaimed-listing surface.

APPROVED still does not make the candidate bookable.

A candidate must pass the same minimum quality gate used for ENRICHED before it can be approved.

### REJECTED
An admin has determined that the candidate is invalid, irrelevant, duplicate noise, or otherwise should not be used.

The system cannot automatically reject a candidate.

New evidence can move a rejected candidate back to REVIEW_REQUIRED.

### ARCHIVED
The candidate is no longer active for discovery purposes, for example because the source appears stale or closed.

The system may archive candidates automatically.

A resurfaced archived candidate returns to REVIEW_REQUIRED rather than directly becoming approved.

### CONVERTED
The candidate has been converted into or linked to a real 36 Studio.

This transition is allowed only from APPROVED.

It requires a real existing Studio id.

CONVERTED is terminal in the discovery lifecycle.

The existing Studio remains subject to the normal 36 owner/admin/bookability rules.

## Allowed lifecycle graph

- DISCOVERED -> ENRICHED
- DISCOVERED -> REVIEW_REQUIRED
- DISCOVERED -> REJECTED
- DISCOVERED -> ARCHIVED

- ENRICHED -> REVIEW_REQUIRED
- ENRICHED -> APPROVED
- ENRICHED -> REJECTED
- ENRICHED -> ARCHIVED

- REVIEW_REQUIRED -> ENRICHED
- REVIEW_REQUIRED -> APPROVED
- REVIEW_REQUIRED -> REJECTED
- REVIEW_REQUIRED -> ARCHIVED

- APPROVED -> REVIEW_REQUIRED
- APPROVED -> ARCHIVED
- APPROVED -> CONVERTED

- REJECTED -> REVIEW_REQUIRED
- ARCHIVED -> REVIEW_REQUIRED

- CONVERTED -> no further state

There is intentionally no shortcut from DISCOVERED directly to APPROVED or CONVERTED.

## Actor permissions

### SYSTEM

Automated jobs may:
- enrich a discovered candidate
- flag a candidate for review
- archive stale candidates
- reopen rejected/archived records into REVIEW_REQUIRED when new evidence appears
- convert an already APPROVED candidate when a real Studio has been created by a later verified claim workflow

Automated jobs may not:
- APPROVE a candidate
- REJECT a candidate
- resolve REVIEW_REQUIRED back into an approved state

### ADMIN

An active 36 ADMIN may perform any transition permitted by the lifecycle graph.

Admin identity is checked by the lifecycle service before an admin transition is committed.

## Audit trail

Every lifecycle transition is stored in CandidateStudioTransition with:
- candidate id
- previous status
- next status
- SYSTEM or ADMIN actor
- admin user id when relevant
- reason code
- optional note
- optional JSON metadata
- timestamp

Database constraints prevent:
- SYSTEM transition rows from carrying an admin user id
- ADMIN transition rows without an admin user id
- blank transition reason codes

Admin audit rows use a restrictive foreign key so the identity behind an approval/rejection is not silently removed.

## Code boundary

All application status changes must use:

`lib/discovery/lifecycle.ts -> transitionCandidateStudio()`

This service provides:
- graph validation
- actor permission validation
- active-admin validation
- ENRICHED/APPROVED data-quality gates
- real Studio validation for CONVERTED
- optimistic status matching
- Serializable transaction
- transition audit creation

No API route or server action is added in D2.

That is deliberate: there is currently no public/admin endpoint that can mutate discovery state.

## Booking isolation remains unchanged

D2 does not change:
- Studio
- Room
- Booking
- Payment
- Payout
- public studio search
- 36 NOW
- owner listing verification

CandidateStudio remains non-bookable.

## D2 migration

D2 adds:
- CandidateStudioTransitionActor enum
- CandidateStudioTransition table
- audit indexes
- candidate audit foreign key
- admin actor foreign key

The migration is additive and does not modify existing marketplace rows.
