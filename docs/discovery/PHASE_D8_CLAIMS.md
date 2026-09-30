# Phase D8 — Studio ownership claims

Date: 2026-09-30

## Purpose

D8 lets a real Studio Owner account claim an APPROVED public discovery listing.

Claim verification proves the relationship between a user and a discovered studio.

It does not create a bookable Studio.

## Claim lifecycle

CandidateStudioClaim statuses:

- SUBMITTED
- VERIFIED
- REJECTED
- WITHDRAWN

Relationships:

- OWNER
- MANAGER
- AUTHORIZED_REPRESENTATIVE

## Submission rules

A claim can be submitted only when:

- the CandidateStudio is APPROVED
- the claimant is an ACTIVE STUDIO_OWNER
- the claimant account email is verified
- a valid business email is supplied
- the claimant supplies either a public proof URL or a meaningful evidence note

The UI explicitly tells claimants never to submit passwords, login codes or private keys.

A rejected or withdrawn claim can be resubmitted using the same claimant/candidate record.

A pending claim cannot be duplicated.

## Admin review

Admins review claims inside the existing discovery candidate detail page.

They can:

- verify a submitted claim
- reject a submitted claim
- leave an admin note

Verification/rejection records:

- reviewedById
- reviewedAt
- adminNote

Only one VERIFIED claim is allowed per candidate through a partial unique database index.

## Owner dashboard

/owner/claims shows:

- claim status
- candidate name/location
- relationship
- business email
- admin note
- submission time
- withdraw action for pending claims

Verified claims explicitly state that onboarding is still required.

## Public discovery page

/discover/[slug] exposes a "Claim this studio" action only as an ownership workflow.

The public page never exposes proof evidence or claimant identity.

## Notifications

Submitting a claim creates in-app notifications for active admins.

Verification/rejection creates an in-app notification for the claimant.

Email delivery remains optional and is not required by D8.

## D9 boundary

D8 does not:

- create Studio
- assign CandidateStudio.convertedStudioId
- change CandidateStudio to CONVERTED
- create Room
- create availability
- create Booking
- create Payment
- make the discovery listing bookable

D9 will consume a VERIFIED claim and create the controlled owner onboarding/conversion path.
