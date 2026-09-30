# Phase D9 — Verified claim to private Studio onboarding

Date: 2026-09-30

## Purpose

D9 converts a VERIFIED discovery ownership claim into the existing 36 Studio onboarding workflow.

This is the bridge between discovery data and the authoritative bookable marketplace.

## Trigger

The verified claimant starts onboarding from /owner/claims.

The action requires:

- ACTIVE STUDIO_OWNER
- verified account email
- VERIFIED CandidateStudioClaim
- CandidateStudio still APPROVED
- no existing converted Studio
- countryCode = MA while the booking marketplace remains Morocco/MAD/Casablanca-time based

## Atomic conversion

A single Serializable database transaction:

1. validates the claimant and verified claim
2. creates a private Studio with status DRAFT
3. copies only safe normalized candidate fields
4. links CandidateStudio.convertedStudioId
5. sets CandidateStudio to CONVERTED
6. records a CandidateStudioTransition audit event

If the conversion race loses, the transaction fails rather than creating duplicate authoritative listings.

## Fields copied into the DRAFT Studio

- name
- mapped primary category
- city
- district -> neighborhood
- address
- coordinates
- phone
- Instagram
- website/proof URL

D9 does not copy:

- rooms
- pricing
- opening hours
- photos
- reviews
- booking availability
- provider confidence as marketplace truth

Those must be supplied/confirmed by the actual studio owner.

## Category mapping

Discovery-only categories are mapped into the existing bookable StudioCategory set:

- VOICE_OVER -> RECORDING
- LIVE_STREAMING -> VIDEO
- POST_PRODUCTION -> PRODUCTION

OTHER cannot convert.

## Public behavior

After conversion:

- the CandidateStudio is CONVERTED
- while its Studio is DRAFT/SUBMITTED/REJECTED, the discovery page remains informational and shows onboarding in progress
- once the Studio becomes VERIFIED, /discover/[slug] redirects to the real /studios/[slug] listing

## Booking safety

Creating the DRAFT Studio does not make it searchable/bookable because existing public marketplace queries require Studio.status = VERIFIED.

No room, price or availability is fabricated.

## Globalization guard

D9 refuses non-MA candidates for now.

The current marketplace booking model is still MAD-based and uses Casablanca time. Global discovery can continue, but global conversion/bookability waits for timezone/currency/country support.

## Database

D9 requires no new migration.
