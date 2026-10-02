"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { validateRoomInterval } from "@/lib/booking";
import {
  marketplaceDateTimeLocalToUtc,
  studioTimeZone,
} from "@/lib/time";

function text(form: FormData, name: string, max = 500) {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

export async function createFlashSlotAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const roomId = text(form, "roomId", 80);
  const startValue = text(form, "startAt", 32);
  const endValue = text(form, "endAt", 32);
  const flashRateMad = Math.round(Number(form.get("flashRateMad")));

  const room = await db.room.findFirst({
    where: { id: roomId, active: true, studio: { ownerId: user.id, status: "VERIFIED" } },
    include: { studio: true },
  });

  if (!room) {
    redirect("/owner/now?error=invalid");
  }

  const timeZone = studioTimeZone(room.studio);
  const startAt = marketplaceDateTimeLocalToUtc(
    startValue,
    timeZone,
  );
  const endAt = marketplaceDateTimeLocalToUtc(
    endValue,
    timeZone,
  );

  if (!startAt || !endAt || endAt <= startAt || startAt <= new Date()) {
    redirect("/owner/now?error=invalid");
  }
  if (!Number.isFinite(flashRateMad) || flashRateMad < 1 || flashRateMad > room.hourlyRateMad) {
    redirect("/owner/now?error=rate");
  }

  const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
  if (durationMinutes < room.minimumHours * 60 || durationMinutes % 30 !== 0) {
    redirect("/owner/now?error=duration");
  }

  const availability = await validateRoomInterval(db, room.id, startAt, endAt);
  if (!availability.ok) redirect("/owner/now?error=unavailable");

  try {
    await db.flashSlot.create({
      data: {
        roomId: room.id,
        startAt,
        endAt,
        originalRateMad: room.hourlyRateMad,
        flashRateMad,
        expiresAt: startAt,
      },
    });
  } catch {
    redirect("/owner/now?error=duplicate");
  }

  revalidatePath("/owner/now");
  revalidatePath("/now");
  redirect("/owner/now?created=1");
}

export async function cancelFlashSlotAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const flashSlotId = text(form, "flashSlotId", 80);
  const slot = await db.flashSlot.findFirst({
    where: { id: flashSlotId, room: { studio: { ownerId: user.id } } },
  });
  if (!slot || slot.status !== "ACTIVE") return;
  await db.flashSlot.update({ where: { id: slot.id }, data: { status: "CANCELLED" } });
  revalidatePath("/owner/now");
  revalidatePath("/now");
}
