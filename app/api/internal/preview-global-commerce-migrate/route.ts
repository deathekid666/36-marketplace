import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_BRANCH = "feature/global-commerce";

export async function GET() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH
  ) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  const statements = [
    'ALTER TABLE "Studio" ADD COLUMN IF NOT EXISTS "countryCode" VARCHAR(2) NOT NULL DEFAULT \'MA\'',
    'ALTER TABLE "Studio" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT \'MAD\'',
    'ALTER TABLE "Studio" ADD COLUMN IF NOT EXISTS "timeZone" TEXT NOT NULL DEFAULT \'Africa/Casablanca\'',
    'ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT \'MAD\'',
    'ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "countryCode" VARCHAR(2) NOT NULL DEFAULT \'MA\'',
    'ALTER TABLE "Booking" ADD COLUMN IF NOT EXISTS "timeZone" TEXT NOT NULL DEFAULT \'Africa/Casablanca\'',
    'ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT \'MAD\'',
    'ALTER TABLE "Payout" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT \'MAD\'',
    'ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT \'MAD\'',
    'ALTER TABLE "StudioRequest" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT \'MAD\'',
    'ALTER TABLE "RequestOffer" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT \'MAD\'',
    'ALTER TABLE "FlashSlot" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT \'MAD\'',
    'ALTER TABLE "PromoCode" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT \'MAD\'',
    'UPDATE "Booking" AS b SET "currency"=s."currency","countryCode"=s."countryCode","timeZone"=s."timeZone" FROM "Studio" AS s WHERE b."studioId"=s."id"',
    'UPDATE "Payment" AS p SET "currency"=b."currency" FROM "Booking" AS b WHERE p."bookingId"=b."id"',
    'UPDATE "Payout" AS p SET "currency"=b."currency" FROM "Booking" AS b WHERE p."bookingId"=b."id"',
    'UPDATE "Invoice" AS i SET "currency"=b."currency" FROM "Booking" AS b WHERE i."bookingId"=b."id"',
    'UPDATE "FlashSlot" AS f SET "currency"=s."currency" FROM "Room" AS r JOIN "Studio" AS s ON s."id"=r."studioId" WHERE f."roomId"=r."id"',
    'UPDATE "RequestOffer" AS o SET "currency"=s."currency" FROM "Studio" AS s WHERE o."studioId"=s."id"',
    'UPDATE "PromoCode" AS p SET "currency"=s."currency" FROM "Studio" AS s WHERE p."studioId"=s."id"',
  ];

  try {
    await db.$transaction(async (tx) => {
      for (const statement of statements) {
        await tx.$executeRawUnsafe(statement);
      }
    });

    const columns = await db.$queryRawUnsafe<Array<{
      table_name: string;
      column_name: string;
    }>>(
      `SELECT table_name, column_name
       FROM information_schema.columns
       WHERE table_schema='public'
         AND column_name IN ('countryCode','currency','timeZone')
         AND table_name IN ('Studio','Booking','Payment','Payout','Invoice','StudioRequest','RequestOffer','FlashSlot','PromoCode')
       ORDER BY table_name, column_name`,
    );

    return NextResponse.json({
      ok: true,
      branch: EXPECTED_BRANCH,
      columns,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Migration failed.",
      },
      { status: 500 },
    );
  }
}
