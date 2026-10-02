-- Extend booking conversations so creators can contact a studio before booking.
-- Existing booking-linked conversations remain valid and unchanged.

ALTER TABLE "Conversation"
  ALTER COLUMN "bookingId" DROP NOT NULL,
  ADD COLUMN "studioId" UUID,
  ADD COLUMN "creatorId" UUID,
  ADD COLUMN "ownerId" UUID,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "Conversation_studioId_updatedAt_idx"
  ON "Conversation"("studioId", "updatedAt");

CREATE INDEX "Conversation_creatorId_updatedAt_idx"
  ON "Conversation"("creatorId", "updatedAt");

CREATE INDEX "Conversation_ownerId_updatedAt_idx"
  ON "Conversation"("ownerId", "updatedAt");

CREATE UNIQUE INDEX "Conversation_inquiry_studio_creator_key"
  ON "Conversation"("studioId", "creatorId")
  WHERE "bookingId" IS NULL;

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_studioId_fkey"
  FOREIGN KEY ("studioId") REFERENCES "Studio"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_creatorId_fkey"
  FOREIGN KEY ("creatorId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
