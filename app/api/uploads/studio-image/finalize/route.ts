import { NextResponse } from "next/server";

import { requireVerifiedRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  deleteManagedMarketplaceStudioPhotos,
  isManagedMarketplaceStudioPhotoUrl,
  marketplaceStudioPhotoPrefix,
} from "@/lib/discovery/studio-photo-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

function clean(value: unknown, max: number) {
  return String(value || "").trim().slice(0, max);
}

export async function POST(request: Request) {
  const user = await requireVerifiedRole("STUDIO_OWNER");

  let body: {
    studioId?: unknown;
    url?: unknown;
    pathname?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
    alt?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const studioId = clean(body.studioId, 80);
  const url = clean(body.url, 1200);
  const pathname = clean(body.pathname, 1200);
  const mimeType = clean(body.mimeType, 100);
  const alt = clean(body.alt, 200);
  const sizeBytes = Math.round(Number(body.sizeBytes) || 0);

  if (
    !studioId ||
    !url ||
    !pathname.startsWith(marketplaceStudioPhotoPrefix(studioId)) ||
    !isManagedMarketplaceStudioPhotoUrl(url, studioId) ||
    !ALLOWED.has(mimeType) ||
    sizeBytes <= 0 ||
    sizeBytes > MAX_BYTES
  ) {
    return NextResponse.json({ error: "INVALID_UPLOAD" }, { status: 400 });
  }

  const studio = await db.studio.findFirst({
    where: {
      id: studioId,
      ownerId: user.id,
    },
    select: {
      id: true,
      status: true,
    },
  });

  if (!studio || studio.status === "SUSPENDED") {
    return NextResponse.json({ error: "STUDIO_NOT_FOUND" }, { status: 404 });
  }

  try {
    const result = await db.$transaction(async (tx) => {
      const photoCount = await tx.studioPhoto.count({
        where: { studioId: studio.id },
      });

      const stored = await tx.storedFile.create({
        data: {
          ownerId: user.id,
          studioId: studio.id,
          kind: "STUDIO_IMAGE",
          provider: "VERCEL_BLOB",
          storageKey: pathname,
          url,
          mimeType,
          sizeBytes: BigInt(sizeBytes),
        },
        select: { id: true },
      });

      const photo = await tx.studioPhoto.create({
        data: {
          studioId: studio.id,
          url,
          alt,
          sortOrder: photoCount,
        },
        select: {
          id: true,
          url: true,
        },
      });

      await tx.studio.update({
        where: { id: studio.id },
        data: {
          status: studio.status === "SUSPENDED" ? "SUSPENDED" : "DRAFT",
          submittedAt:
            studio.status === "SUSPENDED" ? undefined : null,
          verifiedAt:
            studio.status === "SUSPENDED" ? undefined : null,
          verificationNote:
            studio.status === "SUSPENDED" ? undefined : "",
        },
      });

      return {
        fileId: stored.id,
        photoId: photo.id,
        url: photo.url,
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    try {
      await deleteManagedMarketplaceStudioPhotos([url], studioId);
    } catch {
      // Best-effort orphan cleanup.
    }

    console.error("marketplace-studio-photo-finalize-error", {
      studioId,
      message: error instanceof Error ? error.message : "FINALIZE_FAILED",
    });

    return NextResponse.json(
      { error: "Image upload could not be saved." },
      { status: 500 },
    );
  }
}
