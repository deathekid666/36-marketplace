CREATE TYPE "FlashSlotStatus" AS ENUM ('ACTIVE', 'BOOKED', 'EXPIRED', 'CANCELLED');

ALTER TABLE "Studio"
  ADD COLUMN "freeCancellationHours" INTEGER NOT NULL DEFAULT 24,
  ADD CONSTRAINT "Studio_freeCancellationHours_range"
  CHECK ("freeCancellationHours" BETWEEN 0 AND 336);

ALTER TABLE "Booking"
  ADD COLUMN "cancelledAt" TIMESTAMP(3),
  ADD COLUMN "cancelledById" UUID,
  ADD COLUMN "cancellationReason" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "refundAmountMad" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "flashSlotId" UUID,
  ADD CONSTRAINT "Booking_refundAmount_nonnegative" CHECK ("refundAmountMad" >= 0);

ALTER TABLE "Payment"
  ADD COLUMN "checkoutUrl" TEXT NOT NULL DEFAULT '';

CREATE TABLE "FlashSlot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "roomId" UUID NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "originalRateMad" INTEGER NOT NULL,
  "flashRateMad" INTEGER NOT NULL,
  "status" "FlashSlotStatus" NOT NULL DEFAULT 'ACTIVE',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FlashSlot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FlashSlot_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "FlashSlot_time_order" CHECK ("endAt" > "startAt"),
  CONSTRAINT "FlashSlot_rates_positive" CHECK ("originalRateMad" > 0 AND "flashRateMad" > 0),
  CONSTRAINT "FlashSlot_discount_valid" CHECK ("flashRateMad" <= "originalRateMad")
);

CREATE TABLE "Conversation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Conversation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Message" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversationId" UUID NOT NULL,
  "senderId" UUID NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Message_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Message_body_length" CHECK (char_length("body") BETWEEN 1 AND 2000)
);

CREATE TABLE "Review" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "creatorId" UUID NOT NULL,
  "studioId" UUID NOT NULL,
  "rating" INTEGER NOT NULL,
  "accuracy" INTEGER NOT NULL,
  "equipment" INTEGER NOT NULL,
  "communication" INTEGER NOT NULL,
  "comment" TEXT NOT NULL DEFAULT '',
  "ownerReply" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Review_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Review_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Review_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5 AND "accuracy" BETWEEN 1 AND 5 AND "equipment" BETWEEN 1 AND 5 AND "communication" BETWEEN 1 AND 5)
);

ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Booking_flashSlotId_fkey" FOREIGN KEY ("flashSlotId") REFERENCES "FlashSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Conversation_bookingId_key" ON "Conversation"("bookingId");
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX "Message_senderId_idx" ON "Message"("senderId");
CREATE UNIQUE INDEX "Review_bookingId_key" ON "Review"("bookingId");
CREATE INDEX "Review_studioId_createdAt_idx" ON "Review"("studioId", "createdAt");
CREATE INDEX "Review_creatorId_idx" ON "Review"("creatorId");
CREATE UNIQUE INDEX "Booking_flashSlotId_key" ON "Booking"("flashSlotId");
CREATE INDEX "Booking_cancelledById_idx" ON "Booking"("cancelledById");
CREATE INDEX "FlashSlot_roomId_startAt_idx" ON "FlashSlot"("roomId", "startAt");
CREATE INDEX "FlashSlot_status_expiresAt_idx" ON "FlashSlot"("status", "expiresAt");
CREATE UNIQUE INDEX "FlashSlot_roomId_startAt_endAt_key" ON "FlashSlot"("roomId", "startAt", "endAt");
