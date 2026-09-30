import {
  handleUpload,
  type HandleUploadBody,
} from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { studioPhotoPrefix } from "@/lib/discovery/studio-photo-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

function parseClientPayload(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(String(value || "{}")) as { claimId?: unknown };
    const claimId = String(parsed.claimId || "").trim();
    return claimId ? { claimId } : null;
  } catch {
    return null;
  }
}

async function verifiedClaim(claimId: string, claimantId: string) {
  return db.candidateStudioClaim.findFirst({
    where: {
      id: claimId,
      claimantId,
      status: "VERIFIED",
      candidateStudio: {
        status: { in: ["ENRICHED", "APPROVED"] },
      },
    },
    select: {
      id: true,
      candidateStudioId: true,
    },
  });
}

export async function POST(request: Request) {
  const user = await requireRole("STUDIO_OWNER");

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
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = parseClientPayload(clientPayload);
        if (!payload) throw new Error("UPLOAD_CLAIM_REQUIRED");

        const claim = await verifiedClaim(payload.claimId, user.id);
        if (!claim) throw new Error("UPLOAD_CLAIM_FORBIDDEN");

        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_IMAGE_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({
            claimId: claim.id,
            claimantId: user.id,
            candidateStudioId: claim.candidateStudioId,
          }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        try {
          const payload = JSON.parse(String(tokenPayload || "{}")) as {
            claimId?: string;
            claimantId?: string;
          };

          if (
            !payload.claimId ||
            !payload.claimantId ||
            !blob.pathname.startsWith(studioPhotoPrefix(payload.claimId))
          ) {
            console.warn("studio-photo-upload-completed-invalid", {
              pathname: blob.pathname,
            });
            return;
          }

          console.info("studio-photo-upload-completed", {
            claimId: payload.claimId,
            claimantId: payload.claimantId,
            pathname: blob.pathname,
          });
        } catch {
          console.warn("studio-photo-upload-completed-payload-invalid");
        }
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "UPLOAD_FAILED";

    console.error("studio-photo-upload-token-error", { message });

    if (message === "UPLOAD_CLAIM_REQUIRED") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message === "UPLOAD_CLAIM_FORBIDDEN") {
      return NextResponse.json({ error: message }, { status: 403 });
    }

    return NextResponse.json(
      {
        error: "BLOB_STORAGE_UNAVAILABLE",
        message:
          "Studio photo storage is not connected to this deployment yet.",
      },
      { status: 503 },
    );
  }
}
