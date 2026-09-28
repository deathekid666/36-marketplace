ALTER TABLE "Studio" ADD COLUMN "depositPercent" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Studio" ADD CONSTRAINT "Studio_depositPercent_range" CHECK ("depositPercent" BETWEEN 0 AND 100);

CREATE TYPE "BookingStatus" AS ENUM ('PENDING_DEPOSIT', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'EXPIRED', 'DISPUTED');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'FAILED');
CREATE TYPE "PaymentKind" AS ENUM ('DEPOSIT', 'BALANCE', 'REFUND');
CREATE TYPE "StudioRequestStatus" AS ENUM ('OPEN', 'OFFER_SELECTED', 'CLOSED', 'CANCELLED');
CREATE TYPE "RequestOfferStatus" AS ENUM ('ACTIVE', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'EXPIRED');

CREATE TABLE "Booking" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "creatorId" UUID NOT NULL,
  "studioId" UUID NOT NULL,
  "roomId" UUID NOT NULL,
  "status" "BookingStatus" NOT NULL DEFAULT 'PENDING_DEPOSIT',
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "baseAmountMad" INTEGER NOT NULL,
  "depositPercent" INTEGER NOT NULL,
  "depositAmountMad" INTEGER NOT NULL,
  "totalAmountMad" INTEGER NOT NULL,
  "notes" TEXT NOT NULL DEFAULT '',
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Booking_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Booking_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Booking_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Booking_time_order" CHECK ("endAt" > "startAt"),
  CONSTRAINT "Booking_duration_positive" CHECK ("durationMinutes" > 0),
  CONSTRAINT "Booking_amounts_nonnegative" CHECK ("baseAmountMad" >= 0 AND "depositAmountMad" >= 0 AND "totalAmountMad" >= 0),
  CONSTRAINT "Booking_depositPercent_range" CHECK ("depositPercent" BETWEEN 0 AND 100)
);

CREATE TABLE "Payment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "kind" "PaymentKind" NOT NULL,
  "amountMad" INTEGER NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "provider" TEXT NOT NULL DEFAULT 'MANUAL',
  "providerRef" TEXT NOT NULL DEFAULT '',
  "confirmedAt" TIMESTAMP(3),
  "confirmedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payment_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Payment_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Payment_amount_nonnegative" CHECK ("amountMad" >= 0)
);

CREATE TABLE "StudioRequest" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "creatorId" UUID NOT NULL,
  "category" "StudioCategory" NOT NULL,
  "city" TEXT NOT NULL,
  "neighborhood" TEXT NOT NULL DEFAULT '',
  "desiredStartAt" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "budgetMad" INTEGER NOT NULL,
  "engineerRequired" BOOLEAN NOT NULL DEFAULT false,
  "details" TEXT NOT NULL DEFAULT '',
  "status" "StudioRequestStatus" NOT NULL DEFAULT 'OPEN',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioRequest_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudioRequest_duration_positive" CHECK ("durationMinutes" >= 30),
  CONSTRAINT "StudioRequest_budget_positive" CHECK ("budgetMad" > 0)
);

CREATE TABLE "RequestOffer" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "requestId" UUID NOT NULL,
  "studioId" UUID NOT NULL,
  "roomId" UUID NOT NULL,
  "offeredStartAt" TIMESTAMP(3) NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "totalAmountMad" INTEGER NOT NULL,
  "message" TEXT NOT NULL DEFAULT '',
  "status" "RequestOfferStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RequestOffer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "RequestOffer_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "StudioRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RequestOffer_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RequestOffer_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RequestOffer_duration_positive" CHECK ("durationMinutes" >= 30),
  CONSTRAINT "RequestOffer_amount_positive" CHECK ("totalAmountMad" > 0)
);

CREATE INDEX "Booking_creatorId_createdAt_idx" ON "Booking"("creatorId", "createdAt");
CREATE INDEX "Booking_studioId_startAt_idx" ON "Booking"("studioId", "startAt");
CREATE INDEX "Booking_roomId_startAt_endAt_idx" ON "Booking"("roomId", "startAt", "endAt");
CREATE INDEX "Booking_status_expiresAt_idx" ON "Booking"("status", "expiresAt");
CREATE INDEX "Payment_bookingId_status_idx" ON "Payment"("bookingId", "status");
CREATE INDEX "Payment_confirmedById_idx" ON "Payment"("confirmedById");
CREATE INDEX "StudioRequest_creatorId_createdAt_idx" ON "StudioRequest"("creatorId", "createdAt");
CREATE INDEX "StudioRequest_city_category_status_idx" ON "StudioRequest"("city", "category", "status");
CREATE INDEX "StudioRequest_status_expiresAt_idx" ON "StudioRequest"("status", "expiresAt");
CREATE UNIQUE INDEX "RequestOffer_requestId_studioId_key" ON "RequestOffer"("requestId", "studioId");
CREATE INDEX "RequestOffer_requestId_status_idx" ON "RequestOffer"("requestId", "status");
CREATE INDEX "RequestOffer_studioId_createdAt_idx" ON "RequestOffer"("studioId", "createdAt");
CREATE INDEX "RequestOffer_roomId_offeredStartAt_idx" ON "RequestOffer"("roomId", "offeredStartAt");

CREATE OR REPLACE FUNCTION "prevent_booking_overlap"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" IN ('PENDING_DEPOSIT', 'CONFIRMED')
     AND (NEW."status" <> 'PENDING_DEPOSIT' OR NEW."expiresAt" IS NULL OR NEW."expiresAt" > CURRENT_TIMESTAMP) THEN
    PERFORM pg_advisory_xact_lock(hashtext(NEW."roomId"::text));
    IF EXISTS (
      SELECT 1
      FROM "Booking" b
      WHERE b."roomId" = NEW."roomId"
        AND b."id" <> NEW."id"
        AND b."startAt" < NEW."endAt"
        AND b."endAt" > NEW."startAt"
        AND (
          b."status" = 'CONFIRMED'
          OR (b."status" = 'PENDING_DEPOSIT' AND (b."expiresAt" IS NULL OR b."expiresAt" > CURRENT_TIMESTAMP))
        )
    ) THEN
      RAISE EXCEPTION 'ROOM_SLOT_CONFLICT' USING ERRCODE = '23P01';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "Booking_prevent_overlap"
BEFORE INSERT OR UPDATE OF "roomId", "startAt", "endAt", "status", "expiresAt"
ON "Booking"
FOR EACH ROW EXECUTE FUNCTION "prevent_booking_overlap"();
