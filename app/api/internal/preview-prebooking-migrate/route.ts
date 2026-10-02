import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_BRANCH = "feature/prebooking-messaging";

export async function GET() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH
  ) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const statements = [
    'ALTER TABLE "Conversation" ALTER COLUMN "bookingId" DROP NOT NULL',
    'ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "studioId" UUID',
    'ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "creatorId" UUID',
    'ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "ownerId" UUID',
    'ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP',
    'CREATE INDEX IF NOT EXISTS "Conversation_studioId_updatedAt_idx" ON "Conversation"("studioId", "updatedAt")',
    'CREATE INDEX IF NOT EXISTS "Conversation_creatorId_updatedAt_idx" ON "Conversation"("creatorId", "updatedAt")',
    'CREATE INDEX IF NOT EXISTS "Conversation_ownerId_updatedAt_idx" ON "Conversation"("ownerId", "updatedAt")',
    'CREATE UNIQUE INDEX IF NOT EXISTS "Conversation_inquiry_studio_creator_key" ON "Conversation"("studioId", "creatorId") WHERE "bookingId" IS NULL',
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Conversation_studioId_fkey'
      ) THEN
        ALTER TABLE "Conversation"
          ADD CONSTRAINT "Conversation_studioId_fkey"
          FOREIGN KEY ("studioId") REFERENCES "Studio"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Conversation_creatorId_fkey'
      ) THEN
        ALTER TABLE "Conversation"
          ADD CONSTRAINT "Conversation_creatorId_fkey"
          FOREIGN KEY ("creatorId") REFERENCES "User"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Conversation_ownerId_fkey'
      ) THEN
        ALTER TABLE "Conversation"
          ADD CONSTRAINT "Conversation_ownerId_fkey"
          FOREIGN KEY ("ownerId") REFERENCES "User"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      END IF;
    END $$`,
  ];

  try {
    await db.$transaction(async (tx) => {
      for (const statement of statements) {
        await tx.$executeRawUnsafe(statement);
      }
    });

    const columns = await db.$queryRawUnsafe<
      Array<{
        column_name: string;
        is_nullable: string;
      }>
    >(`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Conversation'
        AND column_name IN (
          'bookingId',
          'studioId',
          'creatorId',
          'ownerId',
          'updatedAt'
        )
      ORDER BY column_name
    `);

    const indexes = await db.$queryRawUnsafe<Array<{ indexname: string }>>(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = 'Conversation'
        AND indexname IN (
          'Conversation_studioId_updatedAt_idx',
          'Conversation_creatorId_updatedAt_idx',
          'Conversation_ownerId_updatedAt_idx',
          'Conversation_inquiry_studio_creator_key'
        )
      ORDER BY indexname
    `);

    return NextResponse.json({
      ok: true,
      branch: EXPECTED_BRANCH,
      columns,
      indexes,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          error instanceof Error
            ? error.message
            : "Migration failed.",
      },
      { status: 500 },
    );
  }
}
