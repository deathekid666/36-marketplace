# Phase D7 — Public discovery listings

Date: 2026-09-30

## Purpose

D7 exposes reviewed CandidateStudio records to the public without mixing them with the bookable Studio marketplace.

Only APPROVED discovery candidates are public.

Raw DISCOVERED, ENRICHED, REVIEW_REQUIRED, REJECTED and ARCHIVED candidates remain private.

## Routes

### /discover

Public discovery index.

Features:
- APPROVED candidates only
- name/location search
- city filter
- map for candidates with coordinates
- provider badges
- explicit "not yet bookable" language
- direct link back to the verified/bookable /studios marketplace

### /discover/[slug]

Public candidate detail page.

It shows:
- candidate name
- normalized category
- location/address evidence
- map when coordinates exist
- source/provider transparency
- provider attribution/license link
- optional public website
- explicit non-bookable status

It does not show:
- booking widget
- room inventory
- availability
- 36 reviews
- payment controls
- owner-only/admin-only evidence metadata

## Conversion behavior

If a CandidateStudio reaches CONVERTED and points to a VERIFIED Studio, the discovery URL redirects to the real /studios/[slug] listing.

This preserves old discovery links while moving the user into the authoritative bookable listing.

## Trust boundary

D7 does not weaken any D1-D6 rule.

A candidate must be APPROVED before it is visible.

Approval still does not create:
- User
- Studio
- Room
- Booking
- Payment
- Payout

D8 will add the claim workflow. Until then, discovery pages are informational only.

## Provider attribution

Active source attribution remains visible on the candidate detail page.

For Overture records, the page links to Overture attribution/licensing documentation.

## Database

D7 requires no database migration.
