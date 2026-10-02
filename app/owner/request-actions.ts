"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/commerce";
import { notifyUser } from "@/lib/notifications";
import { trackMarketplaceEvent } from "@/lib/analytics";
import { validateRoomInterval } from "@/lib/booking";
import {
  marketplaceDateTimeLocalToUtc,
  studioTimeZone,
} from "@/lib/time";

function text(form: FormData, name: string, max = 1500) {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

export async function submitRequestOfferAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const requestId = text(form, "requestId", 80);
  const roomId = text(form, "roomId", 80);
  const offeredStartValue = text(form, "offeredStartAt", 32);
  const durationMinutes = Math.round(Number(form.get("durationHours")) * 60);
  const totalAmountMad = Math.round(Number(form.get("totalAmountMad")));
  const message = text(form, "message", 1000);

  const [request, room] = await Promise.all([
    db.studioRequest.findFirst({ where: { id: requestId, status: "OPEN", expiresAt: { gt: new Date() } } }),
    db.room.findFirst({ where: { id: roomId, active: true, studio: { ownerId: user.id, status: "VERIFIED" } }, include: { studio: true } }),
  ]);
  if (
    !request ||
    request.creatorId === user.id ||
    !room ||
    !Number.isFinite(durationMinutes) ||
    durationMinutes < room.minimumHours * 60 ||
    !Number.isFinite(totalAmountMad) ||
    totalAmountMad < 1
  ) {
    redirect("/owner/requests?error=invalid");
  }

  const offeredStartAt = marketplaceDateTimeLocalToUtc(
    offeredStartValue,
    studioTimeZone(room.studio),
  );
  if (!offeredStartAt || offeredStartAt <= new Date()) {
    redirect("/owner/requests?error=invalid");
  }
  if (request.currency !== room.studio.currency) redirect("/owner/requests?error=currency");
  if (request.category !== room.category && request.category !== room.studio.primaryCategory) redirect("/owner/requests?error=category");
  if (request.engineerRequired && !room.engineerIncluded) redirect("/owner/requests?error=engineer");
  if (request.city.toLowerCase() !== room.studio.city.toLowerCase()) redirect("/owner/requests?error=city");

  const endAt = new Date(offeredStartAt.getTime() + durationMinutes * 60000);
  const available = await validateRoomInterval(db, room.id, offeredStartAt, endAt);
  if (!available.ok) redirect("/owner/requests?error=unavailable");

  await db.requestOffer.upsert({
    where: { requestId_studioId: { requestId, studioId: room.studioId } },
    create: {
      requestId,
      studioId: room.studioId,
      roomId: room.id,
      offeredStartAt,
      durationMinutes,
      totalAmountMad,
      currency: room.studio.currency,
      message,
      expiresAt: request.expiresAt,
    },
    update: {
      roomId: room.id,
      offeredStartAt,
      durationMinutes,
      totalAmountMad,
      currency: room.studio.currency,
      message,
      status: "ACTIVE",
      expiresAt: request.expiresAt,
    },
  });

  await Promise.all([
    notifyUser({ userId: request.creatorId, type: "NEW_OFFER", title: `New studio offer`, body: `${room.studio.name} offered ${formatMoney(totalAmountMad, room.studio.currency)} for your 36 Request.`, href: "/creator/requests", email: true, whatsapp: true }),
    trackMarketplaceEvent({ eventType: "OFFER_CREATED", userId: user.id, studioId: room.studioId, metadata: { requestId, totalAmount: totalAmountMad, currency: room.studio.currency } }),
  ]);
  revalidatePath("/owner/requests");
  redirect(`/owner/requests?offered=${requestId}`);
}
