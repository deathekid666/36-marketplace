import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  deleteManagedProfileImages,
  isManagedProfileImageUrl,
  profileImagePrefix,
  profileImageStoredKind,
  type ProfileImageKind,
} from "@/lib/profile-image-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
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
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  let body: {
    kind?: unknown;
    url?: unknown;
    pathname?: unknown;
    mimeType?: unknown;
    sizeBytes?: unknown;
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  const kind = clean(body.kind, 20) as ProfileImageKind;
  const url = clean(body.url, 1200);
  const pathname = clean(body.pathname, 1200);
  const mimeType = clean(body.mimeType, 100);
  const sizeBytes = Math.round(Number(body.sizeBytes) || 0);

  if (
    (kind !== "avatar" && kind !== "cover") ||
    !url ||
    !pathname.startsWith(profileImagePrefix(user.id, kind)) ||
    !isManagedProfileImageUrl(url, user.id, kind) ||
    !ALLOWED.has(mimeType) ||
    sizeBytes <= 0 ||
    sizeBytes > MAX_BYTES
  ) {
    return NextResponse.json({ error: "INVALID_UPLOAD" }, { status: 400 });
  }

  const storedKind = profileImageStoredKind(kind);
  let oldUrls: string[] = [];

  try {
    await db.$transaction(async (tx) => {
      const previous = await tx.storedFile.findMany({
        where: {
          ownerId: user.id,
          kind: storedKind,
        },
        select: {
          url: true,
        },
      });

      oldUrls = previous.map((item) => item.url);

      await tx.storedFile.deleteMany({
        where: {
          ownerId: user.id,
          kind: storedKind,
        },
      });

      await tx.storedFile.create({
        data: {
          ownerId: user.id,
          kind: storedKind,
          provider: "VERCEL_BLOB",
          storageKey: pathname,
          url,
          mimeType,
          sizeBytes: BigInt(sizeBytes),
        },
      });
    });

    if (oldUrls.length) {
      try {
        await deleteManagedProfileImages(oldUrls, user.id, kind);
      } catch {
        // Best-effort old image cleanup.
      }
    }

    return NextResponse.json({ ok: true, url });
  } catch (error) {
    try {
      await deleteManagedProfileImages([url], user.id, kind);
    } catch {
      // Best-effort orphan cleanup.
    }

    console.error("profile-image-finalize-error", {
      userId: user.id,
      kind,
      message:
        error instanceof Error ? error.message : "FINALIZE_FAILED",
    });

    return NextResponse.json(
      { error: "Image upload could not be saved." },
      { status: 500 },
    );
  }
}
