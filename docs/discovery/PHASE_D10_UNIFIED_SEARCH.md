# Phase D10 — Unified marketplace search with trust separation

Date: 2026-09-30

## Goal

D10 lets the main /studios search surface both:

1. verified, bookable 36 Studios
2. reviewed discovery candidates that are not yet bookable

The two result types remain visually and logically separate.

## Search behavior

The existing location and studio-category search is reused for both datasets.

Bookable Studio results continue to honor:
- location
- category
- maximum hourly price
- requested date
- requested duration
- live availability

Discovery results honor only fields that actually exist as reviewed evidence:
- location
- normalized discovery category

Discovery results intentionally do not pretend to have:
- price
- live availability
- rooms
- reviews
- booking eligibility

When a date or maximum price is supplied, the UI explicitly states that those filters apply only to bookable Studio inventory.

## Trust presentation

Bookable results stay in the primary result grid.

Discovery candidates appear in a separate "36 Discovery" section with:
- blue discovery treatment
- "Not yet bookable" status
- provider badges
- link to /discover/[slug]

A discovery record whose converted Studio is already VERIFIED is excluded, because the authoritative Studio result should be used instead.

A normalized-name guard also prevents an approved discovery candidate from being shown next to an identically named bookable result in the same search.

## Location suggestions

The main location input now receives suggestions from both:
- verified Studio city/neighborhood values
- approved/converted CandidateStudio city/district values

This improves discovery without changing booking semantics.

## Analytics

A DISCOVERY_SEARCH_IMPRESSION MarketplaceEvent records:
- query city
- requested category
- number of bookable results
- number of discovery results
- whether date/max-price were bookable-only filters

## Safety invariant

CandidateStudio never enters BookingWidget, Room availability, Favorite, Booking, Payment or Payout flows.

Only Studio.status = VERIFIED remains bookable.
