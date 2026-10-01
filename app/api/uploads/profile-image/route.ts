import {
  handleUpload,
  type HandleUploadBody,
} from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  profileImagePrefix,
  type ProfileImageKind,
} from "@/lib/profile-image-storage";
import {
  consumeRateLimit,
  fingerprintFromRequest,
} from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
];

function parsePayload(value: string | null | undefined) {
  try {
    const parsed = JSON.parse(String(value || "{}")) as {
      kind?: unknown;
    };
    const kind = String(parsed.kind || "") as ProfileImageKind;
    return kind === "avatar" || kind === "cover" ? { kind } : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "Login required." },
      { status: 401 },
    );
  }

  const limit = await consumeRateLimit({
    key: fingerprintFromRequest(request),
    action: "profile-image-upload:" + user.id,
    limit: 20,
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
        if (!payload) throw new Error("UPLOAD_KIND_INVALID");

        if (!pathname.startsWith(profileImagePrefix(user.id, payload.kind))) {
          throw new Error("UPLOAD_PATH_INVALID");
        }

        return {
          allowedContentTypes: ALLOWED_TYPES,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({
            userId: user.id,
            kind: payload.kind,
          }),
        };
      },
      onUploadCompleted: async ({ blob }) => {
        console.info("profile-image-uploaded", {
          userId: user.id,
          pathname: blob.pathname,
        });
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "UPLOAD_FAILED";

    if (
      message === "UPLOAD_KIND_INVALID" ||
      message === "UPLOAD_PATH_INVALID"
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }

    console.error("profile-image-token-error", {
      userId: user.id,
      message,
    });

    return NextResponse.json(
      { error: "Image upload could not start." },
      { status: 503 },
    );
  }
}
