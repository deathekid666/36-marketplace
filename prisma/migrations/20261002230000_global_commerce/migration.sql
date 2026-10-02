-- Global commerce foundation.
-- Legacy amount column names ending in "Mad" are retained for backwards compatibility;
-- their values are interpreted in the attached currency snapshot from this migration onward.

ALTER TABLE "Studio"
  ADD COLUMN "countryCode" VARCHAR(2) NOT NULL DEFAULT 'MA',
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'MAD',
  ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'Africa/Casablanca';

ALTER TABLE "Booking"
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'MAD',
  ADD COLUMN "countryCode" VARCHAR(2) NOT NULL DEFAULT 'MA',
  ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'Africa/Casablanca';

ALTER TABLE "Payment"
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'MAD';

ALTER TABLE "Payout"
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'MAD';

ALTER TABLE "Invoice"
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'MAD';

ALTER TABLE "StudioRequest"
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'MAD';

ALTER TABLE "RequestOffer"
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'MAD';

ALTER TABLE "FlashSlot"
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'MAD';

ALTER TABLE "PromoCode"
  ADD COLUMN "currency" VARCHAR(3) NOT NULL DEFAULT 'MAD';

UPDATE "Booking" AS b
SET
  "currency" = s."currency",
  "countryCode" = s."countryCode",
  "timeZone" = s."timeZone"
FROM "Studio" AS s
WHERE b."studioId" = s."id";

UPDATE "Payment" AS p
SET "currency" = b."currency"
FROM "Booking" AS b
WHERE p."bookingId" = b."id";

UPDATE "Payout" AS p
SET "currency" = b."currency"
FROM "Booking" AS b
WHERE p."bookingId" = b."id";

UPDATE "Invoice" AS i
SET "currency" = b."currency"
FROM "Booking" AS b
WHERE i."bookingId" = b."id";

UPDATE "FlashSlot" AS f
SET "currency" = s."currency"
FROM "Room" AS r
JOIN "Studio" AS s ON s."id" = r."studioId"
WHERE f."roomId" = r."id";

UPDATE "RequestOffer" AS o
SET "currency" = s."currency"
FROM "Studio" AS s
WHERE o."studioId" = s."id";

UPDATE "PromoCode" AS p
SET "currency" = s."currency"
FROM "Studio" AS s
WHERE p."studioId" = s."id";
