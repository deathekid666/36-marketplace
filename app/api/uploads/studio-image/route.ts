import {
  handleUpload,
  type HandleUploadBody,
} from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  marketplaceStudioPhotoPrefix,
} from "@/lib/discovery/studio-photo-storage";
import {
  consumeRateLimit,
  fingerprintFromRequest,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

function parsePayload(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(String(value || "{}")) as {
      studioId?: unknown;
    };
    const studioId = String(parsed.studioId || "").trim();
    return studioId ? { studioId } : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user || user.role !== "STUDIO_OWNER") {
    return NextResponse.json(
      { error: "Studio owner login required." },
      { status: 401 },
    );
  }

  if (!user.emailVerifiedAt) {
    return NextResponse.json(
      { error: "Verify your email first." },
      { status: 403 },
    );
  }

  const limit = await consumeRateLimit({
    key: fingerprintFromRequest(request),
    action: "studio-blob-upload:" + user.id,
    limit: 30,
    windowSeconds: 3600,
  });

  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Upload limit reached. Try later." },
      { status: 429 },
    );
  }

  let body: HandleUploadBody;
  try {
    body = (await request.json()) as HandleUploadBody;
  } catch {
    return NextResponse.json(
      { error: "UPLOAD_BODY_INVALID" },
      { status: 400 },
    );
  }

  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = parsePayload(clientPayload);
        if (!payload) throw new Error("UPLOAD_STUDIO_REQUIRED");

        const studio = await db.studio.findFirst({
          where: {
            id: payload.studioId,
            ownerId: user.id,
          },
          select: {
            id: true,
            status: true,
          },
        });

        if (!studio || studio.status === "SUSPENDED") {
          throw new Error("UPLOAD_STUDIO_FORBIDDEN");
        }

        if (!pathname.startsWith(marketplaceStudioPhotoPrefix(studio.id))) {
          throw new Error("UPLOAD_PATH_INVALID");
        }

        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({
            studioId: studio.id,
            ownerId: user.id,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        console.info("marketplace-studio-photo-uploaded", {
          pathname: blob.pathname,
          tokenPayload: Boolean(tokenPayload),
        });
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "UPLOAD_FAILED";

    if (message === "UPLOAD_STUDIO_REQUIRED" || message === "UPLOAD_PATH_INVALID") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message === "UPLOAD_STUDIO_FORBIDDEN") {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    console.error("marketplace-studio-photo-token-error", { message });
    return NextResponse.json(
      { error: "Image upload could not start." },
      { status: 503 },
    );
  }
}
