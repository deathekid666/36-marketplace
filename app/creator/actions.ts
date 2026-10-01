"use server";

import { redirect } from "next/navigation";
import type { StudioCategory } from "@prisma/client";

import { createBookingHoldInTransaction, BookingConflictError } from "@/lib/booking";
import { requireRole, requireVerifiedRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";
import { scheduleBookingReminders } from "@/lib/reminders";
import { trackMarketplaceEvent } from "@/lib/analytics";
import { STUDIO_CATEGORIES } from "@/lib/studio";
import { casablancaDateTimeLocalToUtc } from "@/lib/time";

function text(form: FormData, name: string, max = 1500) {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

function parseCategory(value: unknown): StudioCategory {
  const raw = String(value ?? "");
  return STUDIO_CATEGORIES.some((x) => x.value === raw) ? (raw as StudioCategory) : "RECORDING";
}

export async function createStudioRequestAction(form: FormData) {
  const user = await requireVerifiedRole("CREATOR");
  const category = parseCategory(form.get("category"));
  const city = text(form, "city", 80) || "Casablanca";
  const neighborhood = text(form, "neighborhood", 100);
  const desiredStartAt = casablancaDateTimeLocalToUtc(text(form, "desiredStartAt", 32));
  const durationMinutes = Math.round(Number(form.get("durationHours")) * 60);
  const budgetMad = Math.round(Number(form.get("budgetMad")));
  const engineerRequired = form.get("engineerRequired") === "on";
  const details = text(form, "details", 2000);

  if (!desiredStartAt || desiredStartAt <= new Date() || !Number.isFinite(durationMinutes) || durationMinutes < 60 || durationMinutes > 12 * 60 || !Number.isFinite(budgetMad) || budgetMad < 50) {
    redirect("/creator/requests?error=invalid");
  }

  const request = await db.studioRequest.create({
    data: {
      creatorId: user.id,
      category,
      city,
      neighborhood,
      desiredStartAt,
      durationMinutes,
      budgetMad,
      engineerRequired,
      details,
      expiresAt: desiredStartAt,
    },
  });

  await trackMarketplaceEvent({ eventType: "REQUEST_CREATED", userId: user.id, metadata: { city, category, budgetMad } });
  redirect(`/creator/requests?created=${request.id}`);
}

export async function acceptOfferAction(form: FormData) {
  const user = await requireVerifiedRole("CREATOR");
  const offerId = text(form, "offerId", 80);
  let bookingId = "";

  try {
    bookingId = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${offerId}))`;
      const offer = await tx.requestOffer.findFirst({
        where: {
          id: offerId,
          status: "ACTIVE",
          expiresAt: { gt: new Date() },
          request: { creatorId: user.id, status: "OPEN", expiresAt: { gt: new Date() } },
        },
        include: { request: true },
      });
      if (!offer) throw new BookingConflictError("Offer is no longer active.");

      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${offer.requestId}))`;
      const freshRequest = await tx.studioRequest.findUnique({ where: { id: offer.requestId } });
      if (!freshRequest || freshRequest.status !== "OPEN" || freshRequest.expiresAt <= new Date()) {
        throw new BookingConflictError("Request is no longer open.");
      }

      const created = await createBookingHoldInTransaction(tx, {
        creatorId: user.id,
        roomId: offer.roomId,
        startAt: offer.offeredStartAt,
        durationMinutes: offer.durationMinutes,
        totalOverrideMad: offer.totalAmountMad,
        notes: `Created from 36 Request ${offer.requestId}`,
      });

      await tx.studioRequest.update({ where: { id: offer.requestId }, data: { status: "OFFER_SELECTED" } });
      await tx.requestOffer.update({ where: { id: offer.id }, data: { status: "ACCEPTED" } });
      await tx.requestOffer.updateMany({ where: { requestId: offer.requestId, id: { not: offer.id }, status: "ACTIVE" }, data: { status: "DECLINED" } });
      return created.id;
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof BookingConflictError) redirect("/creator/requests?error=conflict");
    throw error;
  }

  const accepted = await db.booking.findUnique({ where: { id: bookingId }, include: { studio: true, room: true } });
  if (accepted) {
    if (accepted.status === "CONFIRMED") await scheduleBookingReminders(accepted.id);
    await Promise.all([
      notifyUser({ userId: user.id, type: "OFFER_ACCEPTED", title: `Offer accepted: ${accepted.studio.name}`, body: `Your booking for ${accepted.room.name} is now waiting for the deposit.`, href: `/creator/bookings/${bookingId}`, email: true }),
      notifyUser({ userId: accepted.studio.ownerId, type: "OFFER_ACCEPTED", title: `36 Request offer accepted`, body: `${user.name} accepted your offer.`, href: `/owner/bookings/${bookingId}`, email: true, whatsapp: true }),
    ]);
  }
  redirect(`/creator/bookings/${bookingId}?from=request`);
}

export async function releaseBookingHoldAction(form: FormData) {
  const user = await requireRole("CREATOR");
  const bookingId = text(form, "bookingId", 80);
  const booking = await db.booking.findFirst({
    where: {
      id: bookingId,
      creatorId: user.id,
      status: "PENDING_DEPOSIT",
    },
    include: { flashSlot: true },
  });
  if (!booking) redirect("/creator/bookings");

  const now = new Date();
  const status =
    booking.expiresAt && booking.expiresAt <= now
      ? "EXPIRED"
      : "CANCELLED";

  await db.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: booking.id },
      data: { status, expiresAt: null },
    });
    await tx.payment.updateMany({
      where: {
        bookingId: booking.id,
        status: "PENDING",
        kind: { not: "REFUND" },
      },
      data: { status: "FAILED" },
    });
    await tx.payout.updateMany({
      where: {
        bookingId: booking.id,
        status: { in: ["PENDING", "ELIGIBLE"] },
      },
      data: { status: "HOLD" },
    });
    await tx.promoRedemption.deleteMany({
      where: { bookingId: booking.id },
    });
    await tx.bookingReminder.deleteMany({
      where: { bookingId: booking.id, sentAt: null },
    });

    if (booking.flashSlotId && booking.flashSlot) {
      const canReturnToSale =
        booking.flashSlot.startAt > now &&
        booking.flashSlot.expiresAt > now;
      await tx.flashSlot.updateMany({
        where: {
          id: booking.flashSlotId,
          status: "BOOKED",
        },
        data: {
          status: canReturnToSale ? "ACTIVE" : "EXPIRED",
        },
      });
    }
  });

  redirect(
    status === "EXPIRED"
      ? "/creator/bookings?view=cancelled"
      : "/creator/bookings?released=1",
  );
}
