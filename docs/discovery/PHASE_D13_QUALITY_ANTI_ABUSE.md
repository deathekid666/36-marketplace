# Phase D13 — Discovery quality and anti-abuse

Date: 2026-09-30

## Goal

D13 adds admin-facing evidence quality signals and abuse controls without turning a heuristic into an automatic approval decision.

## Quality assessment

lib/discovery/quality.ts derives a 0–100 evidence score and one of:

- STRONG
- REVIEW
- WEAK

Inputs include:
- normalized identity
- resolved studio category
- country code
- location evidence
- active provider-source count
- public website
- public phone
- D12 freshness

Blockers are surfaced separately.

The score is advisory only. It never:
- changes CandidateStudio.status
- approves a candidate
- verifies a claim
- creates a Studio
- enables booking

Human lifecycle review remains authoritative.

## Ownership-claim abuse controls

Claim submissions now use two rate-limit buckets:

- up to 10 claim attempts per Studio Owner account per 24-hour window
- up to 3 attempts for the same owner + candidate per 24-hour window

Existing protections still apply:
- verified account email
- ACTIVE STUDIO_OWNER role
- APPROVED candidate only
- one pending claim per owner/candidate
- only one VERIFIED claim per candidate
- admin review before ownership verification

## Proof URL safety

Public proof URLs are never fetched by the 36 server.

They must be normal http/https public links.

D13 rejects:
- URL credentials
- localhost / .localhost
- .local hosts
- loopback IPs
- RFC1918-style private IPv4 ranges
- IPv6 loopback/link-local/unique-local ranges

This reduces the chance that an admin is tricked into opening a local/private-network link.

Claimants are still instructed never to submit passwords, login codes or private keys.

## Admin workspace

Candidate detail pages now show:
- evidence quality band
- numeric score
- quality blockers
- positive evidence
- freshness separately

Claim evidence remains admin-only.

## Automated tests

scripts/test-discovery-quality.ts covers:
- strong candidate assessment
- weak candidate assessment
- unsafe local/private proof URLs
- a normal public proof URL

CI runs the fixture before the production build.

## Database

D13 requires no database migration.
