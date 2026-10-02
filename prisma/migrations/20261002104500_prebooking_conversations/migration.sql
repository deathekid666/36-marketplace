-- Extend booking conversations so creators can contact a studio before booking.
-- Idempotent because the live schema is upgraded through a guarded preview migration
-- before this migration is later recorded by Prisma Migrate.

ALTER TABLE "Conversation"
  ALTER COLUMN "bookingId" DROP NOT NULL;

ALTER TABLE "Conversation"
  ADD COLUMN IF NOT EXISTS "studioId" UUID,
  ADD COLUMN IF NOT EXISTS "creatorId" UUID,
  ADD COLUMN IF NOT EXISTS "ownerId" UUID,
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS "Conversation_studioId_updatedAt_idx"
  ON "Conversation"("studioId", "updatedAt");

CREATE INDEX IF NOT EXISTS "Conversation_creatorId_updatedAt_idx"
  ON "Conversation"("creatorId", "updatedAt");

CREATE INDEX IF NOT EXISTS "Conversation_ownerId_updatedAt_idx"
  ON "Conversation"("ownerId", "updatedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_inquiry_studio_creator_key"
  ON "Conversation"("studioId", "creatorId")
  WHERE "bookingId" IS NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Conversation_studioId_fkey'
  ) THEN
    ALTER TABLE "Conversation"
      ADD CONSTRAINT "Conversation_studioId_fkey"
      FOREIGN KEY ("studioId") REFERENCES "Studio"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Conversation_creatorId_fkey'
  ) THEN
    ALTER TABLE "Conversation"
      ADD CONSTRAINT "Conversation_creatorId_fkey"
      FOREIGN KEY ("creatorId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Conversation_ownerId_fkey'
  ) THEN
    ALTER TABLE "Conversation"
      ADD CONSTRAINT "Conversation_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
