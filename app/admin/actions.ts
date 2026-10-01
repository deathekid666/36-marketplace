"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";

function text(form: FormData, name: string, max = 2000) {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

export async function verifyStudioAction(form: FormData) {
  await requireRole("ADMIN");
  const studioId = text(form, "studioId", 80);
  const studio = await db.studio.findFirst({ where: { id: studioId, status: "SUBMITTED" }, include: { owner: true } });
  if (!studio) redirect(`/admin/studios/${studioId}?review=not-submitted`);
  await db.studio.update({ where: { id: studio.id }, data: { status: "VERIFIED", verifiedAt: new Date(), verificationNote: "" } });
  await notifyUser({ userId: studio.ownerId, type: "STUDIO_VERIFIED", title: `${studio.name} is verified`, body: "Your studio is now visible in 36 search and can receive bookings.", href: `/owner/studios/${studio.id}`, email: true, whatsapp: true });
  revalidatePath("/admin");
  revalidatePath("/studios");
  revalidatePath("/discover");
  revalidatePath("/api/map/creative-spaces");
  revalidatePath(`/studios/${studio.slug}`);
  revalidatePath(`/admin/studios/${studioId}`);
  redirect(`/admin/studios/${studioId}?review=verified`);
}

export async function rejectStudioAction(form: FormData) {
  await requireRole("ADMIN");
  const studioId = text(form, "studioId", 80);
  const note = text(form, "note", 2000);
  const studio = await db.studio.findFirst({ where: { id: studioId, status: "SUBMITTED" } });
  if (!studio) redirect(`/admin/studios/${studioId}?review=not-submitted`);
  const verificationNote = note || "Please update the listing and resubmit.";
  await db.studio.update({ where: { id: studio.id }, data: { status: "REJECTED", verifiedAt: null, verificationNote } });
  await notifyUser({ userId: studio.ownerId, type: "STUDIO_CHANGES_REQUIRED", title: `Changes required for ${studio.name}`, body: verificationNote, href: `/owner/studios/${studio.id}`, email: true });
  revalidatePath("/admin");
  revalidatePath("/studios");
  revalidatePath("/discover");
  revalidatePath("/api/map/creative-spaces");
  revalidatePath(`/studios/${studio.slug}`);
  revalidatePath(`/admin/studios/${studioId}`);
  redirect(`/admin/studios/${studioId}?review=rejected`);
}


export async function setStudioCommissionAction(form: FormData) {
  await requireRole("ADMIN");
  const studioId = text(form, "studioId", 80);
  const percent = Number(form.get("commissionPercent"));
  if (!Number.isFinite(percent) || percent < 0 || percent > 50) return;
  await db.studio.update({ where: { id: studioId }, data: { commissionBps: Math.round(percent * 100) } });
  revalidatePath(`/admin/studios/${studioId}`);
  revalidatePath(`/owner/studios/${studioId}`);
}
