import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import {
  profileImagePrefix,
  type ProfileImageKind,
} from "@/lib/profile-image-storage";

export const runtime = "nodejs";

function safeFilename(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100) || "profile-image";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  let body: { kind?: unknown; filename?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const kind = String(body.kind || "") as ProfileImageKind;
  if (kind !== "avatar" && kind !== "cover") {
    return NextResponse.json({ error: "Invalid image type." }, { status: 400 });
  }

  const pathname =
    profileImagePrefix(user.id, kind) +
    crypto.randomUUID() +
    "-" +
    safeFilename(body.filename);

  return NextResponse.json({ pathname });
}
