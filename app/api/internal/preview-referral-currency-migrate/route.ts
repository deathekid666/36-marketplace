import { NextResponse } from "next/server";

import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED_BRANCH = "chore/referral-currency-migration";

export async function GET() {
  if (
    process.env.VERCEL_ENV !== "preview" ||
    process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH
  ) {
    return NextResponse.json({ error: "Not available." }, { status: 404 });
  }

  try {
    await db.$executeRawUnsafe(
      'ALTER TABLE "Referral" ADD COLUMN IF NOT EXISTS "currency" VARCHAR(3) NOT NULL DEFAULT \'MAD\'',
    );

    const columns = await db.$queryRawUnsafe<
      Array<{ column_name: string; data_type: string; column_default: string | null }>
    >(
      `SELECT column_name, data_type, column_default
       FROM information_schema.columns
       WHERE table_schema='public'
         AND table_name='Referral'
         AND column_name='currency'`,
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
