import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { consumeRateLimit, fingerprintFromRequest } from "@/lib/rate-limit";

export const runtime = "nodejs";
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "STUDIO_OWNER") return NextResponse.json({ error: "Studio owner login required." }, { status: 401 });
  if (!user.emailVerifiedAt) return NextResponse.json({ error: "Verify your email first." }, { status: 403 });
  const limit = await consumeRateLimit({ key: fingerprintFromRequest(request), action: `studio-upload:${user.id}`, limit: 20, windowSeconds: 3600 });
  if (!limit.allowed) return NextResponse.json({ error: "Upload limit reached. Try later." }, { status: 429 });

  const form = await request.formData();
  const studioId = String(form.get("studioId") || "");
  const alt = String(form.get("alt") || "").trim().slice(0, 200);
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image." }, { status: 400 });
  if (!ALLOWED.has(file.type) || file.size <= 0 || file.size > MAX_BYTES) return NextResponse.json({ error: "Use JPG, PNG or WebP up to 8 MB." }, { status: 400 });
  const studio = await db.studio.findFirst({ where: { id: studioId, ownerId: user.id } });
  if (!studio) return NextResponse.json({ error: "Studio not found." }, { status: 404 });

  const cloud = process.env.CLOUDINARY_CLOUD_NAME;
  const preset = process.env.CLOUDINARY_UPLOAD_PRESET;
  if (!cloud || !preset) return NextResponse.json({ error: "Image storage is not configured yet." }, { status: 503 });

  const upload = new FormData();
  upload.set("file", file);
  upload.set("upload_preset", preset);
  upload.set("folder", `36/studios/${studio.id}`);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloud)}/image/upload`, { method: "POST", body: upload });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.secure_url || !result.public_id) return NextResponse.json({ error: "Image upload failed." }, { status: 502 });

  const [stored, photo] = await db.$transaction([
    db.storedFile.create({ data: { ownerId: user.id, studioId: studio.id, kind: "STUDIO_IMAGE", provider: "CLOUDINARY", storageKey: String(result.public_id), url: String(result.secure_url), mimeType: file.type, sizeBytes: BigInt(file.size) } }),
    db.studioPhoto.create({ data: { studioId: studio.id, url: String(result.secure_url), alt, sortOrder: 0 } }),
    db.studio.update({ where: { id: studio.id }, data: { status: studio.status === "SUSPENDED" ? "SUSPENDED" : "DRAFT", verifiedAt: studio.status === "SUSPENDED" ? studio.verifiedAt : null, submittedAt: studio.status === "SUSPENDED" ? studio.submittedAt : null } }),
  ]).then((rows) => [rows[0], rows[1]] as const);

  return NextResponse.json({ ok: true, fileId: stored.id, photoId: photo.id, url: photo.url });
}
