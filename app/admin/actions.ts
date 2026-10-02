"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";
import {
  studioCompletion,
  studioOnboardingChecklist,
} from "@/lib/studio";

function text(form: FormData, name: string, max = 2000) {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

function validUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function verifyStudioAction(form: FormData) {
  await requireRole("ADMIN");
  const studioId = text(form, "studioId", 80);
  if (!validUuid(studioId)) redirect("/admin");

  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id
      FROM "Studio"
      WHERE id = ${studioId}::uuid
      FOR UPDATE
    `;

    const studio = await tx.studio.findFirst({
      where: {
        id: studioId,
        status: "SUBMITTED",
      },
      include: {
        owner: true,
        rooms: true,
        photos: true,
        openingHours: true,
      },
    });

    if (!studio) {
      return { ok: false as const, reason: "NOT_SUBMITTED" as const };
    }

    const completion = studioCompletion(studio);
    const checklist = studioOnboardingChecklist(studio);
    if (completion < 78 || !checklist.ready) {
      return { ok: false as const, reason: "NOT_READY" as const };
    }

    const changed = await tx.studio.updateMany({
      where: {
        id: studio.id,
        status: "SUBMITTED",
      },
      data: {
        status: "VERIFIED",
        verifiedAt: new Date(),
        verificationNote: "",
      },
    });

    if (!changed.count) {
      return { ok: false as const, reason: "STATE_CHANGED" as const };
    }

    return {
      ok: true as const,
      studio: {
        id: studio.id,
        slug: studio.slug,
        name: studio.name,
        ownerId: studio.ownerId,
      },
    };
  });

  if (!result.ok) {
    const code =
      result.reason === "NOT_READY"
        ? "not-ready"
        : result.reason === "STATE_CHANGED"
          ? "state-changed"
          : "not-submitted";
    redirect("/admin/studios/" + studioId + "?review=" + code);
  }

  await notifyUser({
    userId: result.studio.ownerId,
    type: "STUDIO_VERIFIED",
    title: result.studio.name + " is verified",
    body:
      "Your studio is now visible in 36 search and can receive bookings.",
    href: "/owner/studios/" + result.studio.id,
    email: true,
    whatsapp: true,
  });

  revalidatePath("/admin");
  revalidatePath("/studios");
  revalidatePath("/discover");
  revalidatePath("/api/map/creative-spaces");
  revalidatePath("/studios/" + result.studio.slug);
  revalidatePath("/admin/studios/" + studioId);

  redirect("/admin/studios/" + studioId + "?review=verified");
}

export async function rejectStudioAction(form: FormData) {
  await requireRole("ADMIN");
  const studioId = text(form, "studioId", 80);
  if (!validUuid(studioId)) redirect("/admin");
  const note = text(form, "note", 2000);
  const verificationNote =
    note || "Please update the listing and resubmit.";

  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT id
      FROM "Studio"
      WHERE id = ${studioId}::uuid
      FOR UPDATE
    `;

    const studio = await tx.studio.findFirst({
      where: {
        id: studioId,
        status: "SUBMITTED",
      },
      select: {
        id: true,
        slug: true,
        name: true,
        ownerId: true,
      },
    });

    if (!studio) {
      return { ok: false as const };
    }

    const changed = await tx.studio.updateMany({
      where: {
        id: studio.id,
        status: "SUBMITTED",
      },
      data: {
        status: "REJECTED",
        verifiedAt: null,
        verificationNote,
      },
    });

    if (!changed.count) {
      return { ok: false as const };
    }

    return {
      ok: true as const,
      studio,
    };
  });

  if (!result.ok) {
    redirect("/admin/studios/" + studioId + "?review=not-submitted");
  }

  await notifyUser({
    userId: result.studio.ownerId,
    type: "STUDIO_CHANGES_REQUIRED",
    title: "Changes required for " + result.studio.name,
    body: verificationNote,
    href: "/owner/studios/" + result.studio.id,
    email: true,
  });

  revalidatePath("/admin");
  revalidatePath("/studios");
  revalidatePath("/discover");
  revalidatePath("/api/map/creative-spaces");
  revalidatePath("/studios/" + result.studio.slug);
  revalidatePath("/admin/studios/" + studioId);

  redirect("/admin/studios/" + studioId + "?review=rejected");
}

export async function setStudioCommissionAction(form: FormData) {
  await requireRole("ADMIN");
  const studioId = text(form, "studioId", 80);
  const percent = Number(form.get("commissionPercent"));

  if (!Number.isFinite(percent) || percent < 0 || percent > 50) {
    return;
  }

  await db.studio.updateMany({
    where: { id: studioId },
    data: { commissionBps: Math.round(percent * 100) },
  });

  revalidatePath("/admin/studios/" + studioId);
  revalidatePath("/owner/studios/" + studioId);
}
