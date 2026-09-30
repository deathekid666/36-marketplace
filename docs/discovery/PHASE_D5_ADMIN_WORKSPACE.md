# Phase D5 — Admin discovery workspace

Date: 2026-09-30

## Purpose

D5 gives 36 administrators a controlled internal interface for inspecting and deciding discovered studio candidates before any external provider is connected.

The workspace is intentionally separate from the existing bookable Studio verification queue.

## Routes

### /admin/discovery

The queue provides:

- total candidate count
- DISCOVERED count
- REVIEW_REQUIRED count
- APPROVED count
- CONVERTED count
- status filter
- country filter
- text search
- pagination
- source count
- lifecycle event count
- converted Studio pointer when present

Search covers:

- candidate name
- normalized name
- city
- country
- website
- Instagram
- phone

The page is ADMIN-only through requireRole("ADMIN").

### /admin/discovery/[id]

The detail view exposes:

- normalized candidate fields
- geography
- public contact fields
- coordinates
- all source records
- source provider keys
- external ids
- provider category
- attribution
- license URL
- active/inactive state
- collection/check timestamps
- lifecycle audit history
- admin identity behind manual transitions
- conversion link when the candidate has become a real 36 Studio

External source/license links are rendered only when they parse as HTTP or HTTPS URLs.

## Admin actions

D5 exposes only discovery lifecycle actions:

- mark enriched
- send to review
- approve
- reject
- archive

Every action:

1. requires an active ADMIN session
2. calls the D2 transitionCandidateStudio() service
3. uses the D2 lifecycle graph
4. uses D2 quality gates for ENRICHED / APPROVED
5. creates a CandidateStudioTransition audit row
6. revalidates admin discovery pages

D5 deliberately does not expose manual CONVERTED actions.

Conversion remains reserved for the later verified claim/onboarding workflow.

## Approval quality panel

The detail page shows whether the candidate currently has:

- valid identity
- resolved non-OTHER category
- two-letter country code
- readable location or coordinates
- at least one active source

These are visibility hints for the same minimum prerequisites enforced by D2.

The UI does not override server-side lifecycle validation.

## Booking isolation

Approval in the discovery workspace does not:

- create User
- create Studio
- create Room
- create availability
- create Booking
- create Payment
- create Payout
- expose a candidate as bookable inventory

CandidateStudio remains isolated from the booking marketplace.

## Database

D5 requires no database migration.

It uses the D1 candidate/source tables and the D2 lifecycle audit table.
