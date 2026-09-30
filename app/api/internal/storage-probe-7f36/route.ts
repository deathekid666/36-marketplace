import { list } from "@vercel/blob";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await list({ prefix: "__36_storage_probe__/", limit: 1 });
    return NextResponse.json({ available: true });
  } catch (error) {
    console.error("studio-photo-storage-probe", {
      message: error instanceof Error ? error.message : "BLOB_UNAVAILABLE",
    });
    return NextResponse.json(
      { available: false, error: "BLOB_STORE_NOT_CONNECTED" },
      { status: 503 },
    );
  }
}
