import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  deleteManagedStudioPhotos,
  isManagedStudioPhotoUrl,
} from "@/lib/discovery/studio-photo-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await requireRole("STUDIO_OWNER");

  let body: { claimId?: unknown; url?: unknown };
  try {
    body = (await request.json()) as { claimId?: unknown; url?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const claimId = String(body.claimId || "").trim();
  const url = String(body.url || "").trim();

  if (!claimId || !isManagedStudioPhotoUrl(url, claimId)) {
    return NextResponse.json({ ok: false, error: "INVALID_PHOTO" }, { status: 400 });
  }

  const claim = await db.candidateStudioClaim.findFirst({
    where: {
      id: claimId,
      claimantId: user.id,
      status: "VERIFIED",
    },
    select: { id: true },
  });

  if (!claim) {
    return NextResponse.json({ ok: false, error: "FORBIDDEN" }, { status: 403 });
  }

  try {
    await deleteManagedStudioPhotos([url], claimId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("studio-photo-delete-error", {
      claimId,
      message: error instanceof Error ? error.message : "DELETE_FAILED",
    });
    return NextResponse.json(
      { ok: false, error: "DELETE_FAILED" },
      { status: 500 },
    );
  }
}
