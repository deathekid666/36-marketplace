# Phase D0 — 36 Marketplace Baseline Audit

Audit date: 2026-09-29

## Frozen runtime baseline

Functional code baseline before this documentation commit:

`5d1e23a3e5f663e34aa416eb746b6c6fdfc7195c`

This phase does **not** change marketplace behavior, Prisma models, booking logic, search logic, authentication, or payment logic.

## Repository inventory

- Next.js: 15.5.26
- React: 19.1.1
- Prisma / Prisma Client: 6.19.3
- TypeScript: 5.9.2
- `app/`: 66 files
- `components/`: 18 files
- `lib/`: 19 files
- Prisma schema + migration files: 9
- CI build workflow: `.github/workflows/build-check.yml`

The CI workflow validates Prisma, generates Prisma Client, runs `tsc --noEmit`, and runs the production Next.js build.

## Current application boundaries

### Identity and roles

The application uses its own cookie/session system backed by `AuthSession`.

Roles:
- `CREATOR`
- `STUDIO_OWNER`
- `ADMIN`

Account state:
- `ACTIVE`
- `SUSPENDED`

Email verification gates marketplace transactions such as booking and studio submission.

### Current studio lifecycle

The current marketplace-owned `Studio` lifecycle is:

`DRAFT -> SUBMITTED -> VERIFIED`

Admin can also move a submission to `REJECTED`, and studios can be `SUSPENDED`.

A material owner edit to a verified/submitted/rejected listing marks the listing dirty and returns it to `DRAFT` unless it is suspended.

Important invariant:

**Only a real 36 Studio with status VERIFIED and an active Room is bookable.**

### Public marketplace

`/studios` currently searches only the internal `Studio` table.

Filters currently include:
- city
- studio/room category
- date
- duration
- maximum hourly price

The result query requires:
- `Studio.status = VERIFIED`
- at least one active matching `Room`

When a date is supplied, room availability is checked before a studio remains in the result set.

`/studios/[slug]` also requires `Studio.status = VERIFIED`.

`/now` exposes active future `FlashSlot` inventory only when its room is active and its studio is verified.

There is currently **no external place/studio discovery provider connected to public search**.

### Supply / studio owner system

Owners can currently manage:
- studio identity and description
- category
- city / neighborhood / address
- latitude / longitude
- phone / website / Instagram
- rooms
- hourly room pricing
- minimum hours
- capacity
- engineer inclusion
- equipment
- photos
- amenities
- opening hours
- blocked slots
- add-ons
- deposit percentage
- free-cancellation window
- legal/tax fields
- 36 NOW slots

Owners submit a sufficiently complete studio for admin verification.

### Booking core

Booking creation is restricted to verified Creator accounts.

Current booking protection includes:
- server-side role and email verification
- rate limiting
- active-room / verified-studio checks
- opening-hour validation
- minimum duration
- 30-minute increments
- maximum 12-hour booking
- blocked-slot collision checks
- confirmed-booking collision checks
- unexpired deposit-hold collision checks
- PostgreSQL advisory lock per room
- Serializable transaction for booking creation
- 30-minute deposit hold
- booking payment records
- payout record creation
- promo redemption
- add-ons
- reminders
- cancellation/refund flow
- disputes

This booking subsystem must remain isolated from the future discovery subsystem.

### Payments

The current payment abstraction supports:
- deposit
- balance
- refund
- manual/admin payment confirmation
- signed normalized payment webhook
- automatic conflict/late-payment dispute handling
- payout hold / eligible / paid lifecycle

The default provider boundary is currently `MANUAL` unless configured otherwise.

### Communications / operations

Existing operational subsystems include:
- in-app notifications
- optional Resend email
- optional Meta WhatsApp templates
- booking conversations/messages
- booking attachments
- studio image uploads
- reminders
- invoices
- disputes
- promos
- referrals
- analytics events
- favorites

## Current database state

Neon project:
- Project ID: `fancy-math-85018550`
- Branch: `36-marketplace`
- Branch ID: `br-purple-hall-b5fxflim`
- Database: `marketplace36`

The database currently contains 34 application tables.

Current sample/test data observed during the audit:
- Users: 5
  - 1 ADMIN
  - 1 CREATOR
  - 3 STUDIO_OWNER
- Studios: 3
  - all 3 VERIFIED
- Rooms: 3
- Bookings: 3
  - 1 PENDING_DEPOSIT
  - 1 CONFIRMED
  - 1 COMPLETED
- Payments: 6
  - 4 PAID
  - 2 PENDING
- Flash slots: 2
- Studio requests: 1
- Reviews: 1
- Favorites: 0
- Marketplace events: 0

## Deployment state at audit time

Vercel project:
- `36-marketplace`

Production deployment of baseline commit `5d1e23a...` is in `READY` state.

However, the production health endpoint currently returns:

- HTTP 503
- `database: "unreachable"`

Therefore the Next.js project builds successfully, but the deployed runtime is **not currently connected successfully to the Neon marketplace database**.

This must be fixed before relying on production functional tests.

The production deployment also currently responds with Vercel Authentication protection when accessed externally. That is separate from 36's own application authentication and must be reviewed before a public launch.

## Database migration warning

The live `marketplace36` database has the expected marketplace tables, but there is currently **no `_prisma_migrations` table**.

That means the live schema exists without Prisma having a registered migration history.

Do not run `prisma migrate deploy` blindly against this database.

Before the discovery schema is introduced, the existing live schema needs a deliberate Prisma migration baseline so that future migrations are deterministic and do not attempt to recreate existing objects.

## Existing globalization constraints

The present booking marketplace is Morocco-first. These are existing constraints, not discovery-system defects:

1. `lib/time.ts` fixes marketplace time to `Africa/Casablanca`.
2. Booking validation and formatting use the Casablanca timezone.
3. `lib/geocoding.ts` restricts Mapbox geocoding to country `ma`.
4. Owner studio creation defaults to Casablanca.
5. Public studio search defaults to Casablanca.
6. The location UI explicitly says “Searching Morocco…”.
7. Money fields are encoded as MAD-specific fields such as:
   - `hourlyRateMad`
   - `totalAmountMad`
   - `depositAmountMad`
   - `amountMad`
   - `netAmountMad`
8. Public copy still says “Casablanca first · Morocco next”.

The future discovery layer can be global without immediately changing booking currency/timezone behavior because discovered candidates will not be bookable.

Global booking must be treated as a separate later migration.

## Other existing issues found

### Missing package-script targets

`package.json` declares:
- `admin:create -> scripts/create-admin.mjs`
- `db:seed-demo -> scripts/seed-demo.mjs`
- `test:smoke-db -> scripts/smoke-db.mjs`

The `scripts/` directory and those files are not currently present in the repository.

The normal production build does not call them, so this does not prevent Vercel from building, but these commands are currently broken.

### Reminder cadence mismatch

The reminder subsystem creates 24-hour and 2-hour reminders.

The Vercel Hobby-compatible cron currently runs once per day at 08:00 UTC.

A once-daily worker cannot reliably deliver a 2-hour reminder near the intended time.

This is an existing operational limitation and is not part of the discovery build.

## Discovery-system isolation rules

The following rules are frozen before Phase D1:

1. External provider records must never be inserted directly into `Studio`.
2. No fake `User` or fake studio owner will be created to satisfy `Studio.ownerId`.
3. External/candidate studios cannot create `Room`, `Booking`, `Payment`, `Review`, or `Payout` records.
4. Existing `Studio` booking eligibility remains unchanged.
5. Existing `/studios` behavior remains unchanged until a later explicitly reviewed integration phase.
6. Existing owner/admin verification stays authoritative for bookable 36 studios.
7. Owner-entered verified data must never be overwritten automatically by an external discovery provider.
8. Provider-specific raw/source evidence must stay separate from normalized candidate data.
9. No provider API is connected before provider storage/licensing rules and field mappings are reviewed.
10. No destructive migration is permitted for the discovery build.

## Safe extension point for Phase D1

The safest architecture is an additive discovery domain beside the marketplace:

`External Provider -> CandidateStudioSource -> CandidateStudio -> review/claim -> existing Studio`

The current `Studio` model should continue to mean:

**an owner-controlled 36 marketplace listing capable of becoming bookable.**

A future `CandidateStudio` should mean:

**a discovered public place record that is not yet a 36 bookable listing.**

This is the boundary Phase D1 must preserve.

## D0 exit status

Completed:
- repository structure audited
- current route surface inventoried
- Prisma model reviewed
- live Neon branch/database inspected
- sample data inspected using read-only queries
- booking boundary audited
- owner/admin verification boundary audited
- public studio search boundary audited
- global-readiness constraints identified
- current production build confirmed READY
- discovery isolation rules frozen

Blocking issues before a database-changing Phase D1 migration:
- production Vercel -> Neon database connectivity is currently failing
- Prisma migration history is not baselined in the live database

No marketplace feature behavior was changed during this audit.
