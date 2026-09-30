# Phase D12 — Refresh and staleness policy

Date: 2026-09-30

## Goal

Provider data changes over time. D12 adds an explicit freshness policy instead of assuming that imported discovery evidence remains current forever.

## Freshness states

Freshness is derived from CandidateStudio.lastCheckedAt:

- FRESH: checked within 45 days
- AGING: checked more than 45 days ago but no more than 90 days ago
- STALE: checked more than 90 days ago
- UNKNOWN: never checked / invalid timestamp

The thresholds live in lib/discovery/freshness.ts.

## Provider refresh behavior

Existing provider imports already refresh:
- CandidateStudioSource.lastCheckedAt
- CandidateStudio.lastCheckedAt
- CandidateStudio.lastSeenAt

A successful refresh therefore moves the candidate back to FRESH without changing its lifecycle approval state.

## Public visibility

APPROVED discovery candidates are public only when their provider evidence is not stale/unknown.

This applies to:
- /discover
- unified /studios discovery suggestions
- direct /discover/[slug] routes

CONVERTED candidates are different: once a verified claimant has started owner onboarding, provider freshness no longer decides whether the informational page remains visible. The real owner workflow has become the stronger authority.

A VERIFIED Studio still replaces the discovery page entirely.

## Empty snapshot safety

An empty provider snapshot never archives candidates and never marks existing sources inactive.

Absence from one snapshot is not enough evidence that a business closed.

## Admin visibility

The discovery workspace now shows:
- freshness badges
- stale/unchecked candidate count
- stale filter shortcut

Candidate detail pages show the last provider check and explain the public visibility rule.

## No automatic deletion

D12 does not delete candidates, sources, claims or converted Studios.

Staleness is a reversible visibility/quality signal.

## Database

D12 requires no database migration.
