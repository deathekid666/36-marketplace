import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { bookingFinancials } from "@/lib/finance";
import { parseOfflinePaymentMethod } from "@/lib/offline-payment";
import {
  formatMarketplaceTime,
  localDateKey,
  mondayIndexForDateKey,
  zonedLocalToUtc,
} from "@/lib/time";

export const BOOKING_HOLD_MINUTES = 30;

export class BookingConflictError extends Error {
  constructor(message = "That time is no longer available.") {
    super(message);
    this.name = "BookingConflictError";
  }
}

type DbClient = Prisma.TransactionClient | typeof db;

function overlaps(startA: Date, endA: Date, startB: Date, endB: Date) {
  return startA < endB && endA > startB;
}

export async function validateRoomInterval(
  client: DbClient,
  roomId: string,
  startAt: Date,
  endAt: Date,
) {
  if (!(startAt < endAt)) return { ok: false as const, reason: "Invalid time range." };
  if (startAt <= new Date()) return { ok: false as const, reason: "Choose a future time." };

  const room = await client.room.findFirst({
    where: { id: roomId, active: true, studio: { status: "VERIFIED" } },
    include: { studio: { include: { openingHours: true } } },
  });
  if (!room) return { ok: false as const, reason: "Room is not bookable." };

  const durationMinutes = Math.round((endAt.getTime() - startAt.getTime()) / 60000);
  if (durationMinutes < room.minimumHours * 60) {
    return { ok: false as const, reason: `Minimum booking is ${room.minimumHours} hour(s).` };
  }
  if (durationMinutes > 12 * 60 || durationMinutes % 30 !== 0) {
    return { ok: false as const, reason: "Bookings must be 30-minute increments, up to 12 hours." };
  }

  const startDateKey = localDateKey(startAt);
  if (localDateKey(endAt) !== startDateKey) {
    return { ok: false as const, reason: "Bookings cannot cross midnight in this version." };
  }
  const opening = room.studio.openingHours.find((h) => h.dayOfWeek === mondayIndexForDateKey(startDateKey));
  if (!opening || opening.closed) return { ok: false as const, reason: "Studio is closed on this date." };

  const openAt = zonedLocalToUtc(startDateKey, opening.opensAt);
  const closeAt = zonedLocalToUtc(startDateKey, opening.closesAt);
  if (!openAt || !closeAt || startAt < openAt || endAt > closeAt) {
    return { ok: false as const, reason: "Time is outside opening hours." };
  }

  const [blocked, bookingConflict] = await Promise.all([
    client.blockedSlot.findFirst({
      where: { roomId, startAt: { lt: endAt }, endAt: { gt: startAt } },
      select: { id: true },
    }),
    client.booking.findFirst({
      where: {
        roomId,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        OR: [
          { status: "CONFIRMED" },
          { status: "PENDING_DEPOSIT", expiresAt: { gt: new Date() } },
        ],
      },
      select: { id: true },
    }),
  ]);

  if (blocked) return { ok: false as const, reason: "This room is blocked at that time." };
  if (bookingConflict) return { ok: false as const, reason: "That time has just been reserved." };

  return { ok: true as const, room, durationMinutes };
}

export async function getRoomAvailability(roomId: string, dateValue: string, durationMinutes: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return [];
  if (!Number.isFinite(durationMinutes) || durationMinutes < 30 || durationMinutes > 12 * 60 || durationMinutes % 30 !== 0) return [];

  const room = await db.room.findFirst({
    where: { id: roomId, active: true, studio: { status: "VERIFIED" } },
    include: { studio: { include: { openingHours: true } } },
  });
  if (!room || durationMinutes < room.minimumHours * 60) return [];

  const opening = room.studio.openingHours.find((h) => h.dayOfWeek === mondayIndexForDateKey(dateValue));
  if (!opening || opening.closed) return [];
  const openAt = zonedLocalToUtc(dateValue, opening.opensAt);
  const closeAt = zonedLocalToUtc(dateValue, opening.closesAt);
  if (!openAt || !closeAt) return [];

  const windowEnd = new Date(closeAt.getTime() + 1);
  const [blocked, bookings] = await Promise.all([
    db.blockedSlot.findMany({
      where: { roomId, startAt: { lt: windowEnd }, endAt: { gt: openAt } },
      select: { startAt: true, endAt: true },
    }),
    db.booking.findMany({
      where: {
        roomId,
        startAt: { lt: windowEnd },
        endAt: { gt: openAt },
        OR: [
          { status: "CONFIRMED" },
          { status: "PENDING_DEPOSIT", expiresAt: { gt: new Date() } },
        ],
      },
      select: { startAt: true, endAt: true },
    }),
  ]);

  const busy = [...blocked, ...bookings];
  const now = new Date();
  const slots: { startAt: string; endAt: string; label: string }[] = [];

  for (let cursor = openAt.getTime(); cursor + durationMinutes * 60000 <= closeAt.getTime(); cursor += 30 * 60000) {
    const startAt = new Date(cursor);
    const endAt = new Date(cursor + durationMinutes * 60000);
    if (startAt <= now) continue;
    if (busy.some((b) => overlaps(startAt, endAt, b.startAt, b.endAt))) continue;
    slots.push({
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      label: `${formatMarketplaceTime(startAt)} – ${formatMarketplaceTime(endAt)}`,
    });
  }
  return slots;
}

export async function getRoomAvailabilityCalendar(
  roomId: string,
  startDateValue: string,
  days: number,
  durationMinutes: number,
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDateValue)) return {};
  if (!Number.isFinite(days) || days < 1 || days > 120) return {};
  if (
    !Number.isFinite(durationMinutes) ||
    durationMinutes < 30 ||
    durationMinutes > 12 * 60 ||
    durationMinutes % 30 !== 0
  ) {
    return {};
  }

  const room = await db.room.findFirst({
    where: { id: roomId, active: true, studio: { status: "VERIFIED" } },
    include: { studio: { include: { openingHours: true } } },
  });

  if (!room || durationMinutes < room.minimumHours * 60) return {};

  const [startYear, startMonth, startDay] = startDateValue.split("-").map(Number);
  const startUtc = new Date(Date.UTC(startYear, startMonth - 1, startDay));

  const dateKeys = Array.from({ length: days }, (_, index) => {
    const date = new Date(startUtc.getTime() + index * 24 * 60 * 60 * 1000);
    return [
      String(date.getUTCFullYear()).padStart(4, "0"),
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");
  });

  const firstDate = dateKeys[0];
  const lastDate = dateKeys[dateKeys.length - 1];
  const queryStart = zonedLocalToUtc(firstDate, "00:00");
  const nextDayUtc = new Date(startUtc.getTime() + days * 24 * 60 * 60 * 1000);
  const nextDate = [
    String(nextDayUtc.getUTCFullYear()).padStart(4, "0"),
    String(nextDayUtc.getUTCMonth() + 1).padStart(2, "0"),
    String(nextDayUtc.getUTCDate()).padStart(2, "0"),
  ].join("-");
  const queryEnd = zonedLocalToUtc(nextDate, "00:00");

  if (!queryStart || !queryEnd) return {};

  const [blocked, bookings] = await Promise.all([
    db.blockedSlot.findMany({
      where: {
        roomId,
        startAt: { lt: queryEnd },
        endAt: { gt: queryStart },
      },
      select: { startAt: true, endAt: true },
    }),
    db.booking.findMany({
      where: {
        roomId,
        startAt: { lt: queryEnd },
        endAt: { gt: queryStart },
        OR: [
          { status: "CONFIRMED" },
          { status: "PENDING_DEPOSIT", expiresAt: { gt: new Date() } },
        ],
      },
      select: { startAt: true, endAt: true },
    }),
  ]);

  const busy = [...blocked, ...bookings];
  const now = new Date();
  const result: Record<string, number> = {};

  for (const dateValue of dateKeys) {
    const opening = room.studio.openingHours.find(
      (hour) => hour.dayOfWeek === mondayIndexForDateKey(dateValue),
    );

    if (!opening || opening.closed) {
      result[dateValue] = 0;
      continue;
    }

    const openAt = zonedLocalToUtc(dateValue, opening.opensAt);
    const closeAt = zonedLocalToUtc(dateValue, opening.closesAt);

    if (!openAt || !closeAt || closeAt <= openAt) {
      result[dateValue] = 0;
      continue;
    }

    let slotCount = 0;

    for (
      let cursor = openAt.getTime();
      cursor + durationMinutes * 60000 <= closeAt.getTime();
      cursor += 30 * 60000
    ) {
      const startAt = new Date(cursor);
      const endAt = new Date(cursor + durationMinutes * 60000);

      if (startAt <= now) continue;
      if (busy.some((item) => overlaps(startAt, endAt, item.startAt, item.endAt))) {
        continue;
      }

      slotCount += 1;
    }

    result[dateValue] = slotCount;
  }

  return result;
}

export type CreateBookingInput = {
  creatorId: string;
  roomId: string;
  startAt: Date;
  durationMinutes: number;
  notes?: string;
  totalOverrideMad?: number;
  expectedTotalMad?: number;
  paymentMethod?: string;
  flashSlotId?: string;
  addons?: Array<{ addonId: string; quantity: number }>;
  promoCode?: string;
};

export type BookingQuote = {
  studioId: string;
  roomId: string;
  roomName: string;
  hourlyRateMad: number;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  baseAmountMad: number;
  addons: Array<{
    addonId: string;
    name: string;
    unitPriceMad: number;
    quantity: number;
    totalMad: number;
  }>;
  addonTotalMad: number;
  promoCode: string;
  promoDiscountMad: number;
  discountedSubtotalMad: number;
  taxBps: number;
  taxAmountMad: number;
  totalAmountMad: number;
  depositPercent: number;
  depositAmountMad: number;
  balanceAmountMad: number;
  holdMinutes: number;
};

export async function getBookingQuote(input: {
  creatorId: string;
  roomId: string;
  startAt: Date;
  durationMinutes: number;
  addons?: Array<{ addonId: string; quantity: number }>;
  promoCode?: string;
}): Promise<BookingQuote> {
  const endAt = new Date(
    input.startAt.getTime() + input.durationMinutes * 60000,
  );
  const valid = await validateRoomInterval(
    db,
    input.roomId,
    input.startAt,
    endAt,
  );
  if (!valid.ok) throw new BookingConflictError(valid.reason);

  const baseAmountMad = Math.round(
    (valid.room.hourlyRateMad * input.durationMinutes) / 60,
  );

  const requestedAddons = (input.addons || [])
    .map((item) => ({
      addonId: item.addonId,
      quantity: Math.max(
        1,
        Math.min(10, Math.round(item.quantity || 1)),
      ),
    }))
    .filter(
      (item, index, all) =>
        item.addonId &&
        all.findIndex((row) => row.addonId === item.addonId) === index,
    );

  const addons = requestedAddons.length
    ? await db.studioAddon.findMany({
        where: {
          id: { in: requestedAddons.map((item) => item.addonId) },
          studioId: valid.room.studioId,
          active: true,
          OR: [{ roomId: null }, { roomId: valid.room.id }],
        },
      })
    : [];

  const addonLines = addons.map((addon) => {
    const requested = requestedAddons.find(
      (item) => item.addonId === addon.id,
    )!;
    return {
      addonId: addon.id,
      name: addon.name,
      unitPriceMad: addon.unitPriceMad,
      quantity: requested.quantity,
      totalMad: addon.unitPriceMad * requested.quantity,
    };
  });

  const addonTotalMad = addonLines.reduce(
    (sum, line) => sum + line.totalMad,
    0,
  );
  const subtotalBeforeDiscount = baseAmountMad + addonTotalMad;

  let promoDiscountMad = 0;
  const promoCode = String(input.promoCode || "").trim().toUpperCase();

  if (promoCode) {
    const now = new Date();
    const candidate = await db.promoCode.findFirst({
      where: {
        code: promoCode,
        active: true,
        OR: [{ studioId: null }, { studioId: valid.room.studioId }],
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      include: { _count: { select: { redemptions: true } } },
    });

    if (
      !candidate ||
      subtotalBeforeDiscount < candidate.minBookingMad ||
      (candidate.maxUses != null &&
        candidate._count.redemptions >= candidate.maxUses)
    ) {
      throw new BookingConflictError(
        "Promo code is invalid or unavailable.",
      );
    }

    const userUses = await db.promoRedemption.count({
      where: {
        promoId: candidate.id,
        userId: input.creatorId,
      },
    });

    if (userUses >= candidate.perUserLimit) {
      throw new BookingConflictError("Promo code usage limit reached.");
    }

    promoDiscountMad =
      candidate.discountType === "PERCENT"
        ? Math.round(
            (subtotalBeforeDiscount *
              Math.min(100, candidate.amount)) /
              100,
          )
        : Math.min(subtotalBeforeDiscount, candidate.amount);
  }

  const discountedSubtotalMad = Math.max(
    0,
    subtotalBeforeDiscount - promoDiscountMad,
  );
  const taxBps = valid.room.studio.taxRateBps || 0;
  const taxAmountMad = Math.round(
    (discountedSubtotalMad * taxBps) / 10000,
  );
  const totalAmountMad = discountedSubtotalMad + taxAmountMad;
  const depositPercent = valid.room.studio.depositPercent;
  const depositAmountMad = Math.round(
    (totalAmountMad * depositPercent) / 100,
  );
  const balanceAmountMad = Math.max(
    0,
    totalAmountMad - depositAmountMad,
  );

  return {
    studioId: valid.room.studioId,
    roomId: valid.room.id,
    roomName: valid.room.name,
    hourlyRateMad: valid.room.hourlyRateMad,
    startAt: input.startAt.toISOString(),
    endAt: endAt.toISOString(),
    durationMinutes: input.durationMinutes,
    baseAmountMad,
    addons: addonLines,
    addonTotalMad,
    promoCode,
    promoDiscountMad,
    discountedSubtotalMad,
    taxBps,
    taxAmountMad,
    totalAmountMad,
    depositPercent,
    depositAmountMad,
    balanceAmountMad,
    holdMinutes: BOOKING_HOLD_MINUTES,
  };
}

export async function createBookingHoldInTransaction(tx: Prisma.TransactionClient, input: CreateBookingInput) {
  const endAt = new Date(input.startAt.getTime() + input.durationMinutes * 60000);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${input.roomId}))`;
  const valid = await validateRoomInterval(tx, input.roomId, input.startAt, endAt);
  if (!valid.ok) throw new BookingConflictError(valid.reason);

  const baseAmountMad = Math.round((valid.room.hourlyRateMad * input.durationMinutes) / 60);
  const requestedAddons = (input.addons || [])
    .map((item) => ({ addonId: item.addonId, quantity: Math.max(1, Math.min(10, Math.round(item.quantity || 1))) }))
    .filter((item, index, all) => item.addonId && all.findIndex((x) => x.addonId === item.addonId) === index);
  const addons = requestedAddons.length && !input.totalOverrideMad
    ? await tx.studioAddon.findMany({
        where: {
          id: { in: requestedAddons.map((x) => x.addonId) },
          studioId: valid.room.studioId,
          active: true,
          OR: [{ roomId: null }, { roomId: valid.room.id }],
        },
      })
    : [];
  const addonLines = addons.map((addon) => {
    const requested = requestedAddons.find((x) => x.addonId === addon.id)!;
    return {
      addonId: addon.id,
      nameSnapshot: addon.name,
      unitPriceMad: addon.unitPriceMad,
      quantity: requested.quantity,
      totalMad: addon.unitPriceMad * requested.quantity,
    };
  });
  const addonTotalMad = addonLines.reduce((sum, line) => sum + line.totalMad, 0);
  const subtotalBeforeDiscount = input.totalOverrideMad && input.totalOverrideMad > 0
    ? Math.round(input.totalOverrideMad)
    : baseAmountMad + addonTotalMad;

  let promoDiscountMad = 0;
  let promo: null | { id: string } = null;
  const promoCode = String(input.promoCode || "").trim().toUpperCase();
  if (promoCode && !input.totalOverrideMad) {
    const now = new Date();
    const candidate = await tx.promoCode.findFirst({
      where: {
        code: promoCode,
        active: true,
        OR: [{ studioId: null }, { studioId: valid.room.studioId }],
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
        ],
      },
      include: { _count: { select: { redemptions: true } } },
    });
    if (!candidate || subtotalBeforeDiscount < candidate.minBookingMad || (candidate.maxUses != null && candidate._count.redemptions >= candidate.maxUses)) {
      throw new BookingConflictError("Promo code is invalid or unavailable.");
    }
    const userUses = await tx.promoRedemption.count({ where: { promoId: candidate.id, userId: input.creatorId } });
    if (userUses >= candidate.perUserLimit) throw new BookingConflictError("Promo code usage limit reached.");
    promoDiscountMad = candidate.discountType === "PERCENT"
      ? Math.round(subtotalBeforeDiscount * Math.min(100, candidate.amount) / 100)
      : Math.min(subtotalBeforeDiscount, candidate.amount);
    promo = { id: candidate.id };
  }

  const discountedSubtotalMad = Math.max(0, subtotalBeforeDiscount - promoDiscountMad);
  const taxBps = valid.room.studio.taxRateBps || 0;
  const taxAmountMad = Math.round(discountedSubtotalMad * taxBps / 10000);
  const totalAmountMad = discountedSubtotalMad + taxAmountMad;

  if (
    input.expectedTotalMad != null &&
    Number.isFinite(input.expectedTotalMad) &&
    Math.round(input.expectedTotalMad) !== totalAmountMad
  ) {
    throw new BookingConflictError(
      "The price changed before confirmation. Review the updated total and try again.",
    );
  }

  const finance = bookingFinancials(discountedSubtotalMad, valid.room.studio.commissionBps);
  const commissionAmountMad = finance.commissionAmountMad;
  const studioNetAmountMad = Math.max(0, totalAmountMad - commissionAmountMad);
  const offlinePaymentMethod = parseOfflinePaymentMethod(
    input.paymentMethod,
  );
  const configuredDepositPercent = valid.room.studio.depositPercent;
  const depositPercent = offlinePaymentMethod
    ? 0
    : configuredDepositPercent;
  const depositAmountMad = offlinePaymentMethod
    ? 0
    : Math.round((totalAmountMad * depositPercent) / 100);
  const balanceAmountMad = Math.max(
    0,
    totalAmountMad - depositAmountMad,
  );
  const noDeposit = depositAmountMad === 0;
  const fullyPaidAtCreation = totalAmountMad === 0;
  const expiresAt =
    offlinePaymentMethod || noDeposit
      ? null
      : new Date(Date.now() + BOOKING_HOLD_MINUTES * 60000);
  const paymentProvider =
    offlinePaymentMethod ||
    process.env.PAYMENT_PROVIDER ||
    "MANUAL";

  return tx.booking.create({
    data: {
      creatorId: input.creatorId,
      studioId: valid.room.studioId,
      roomId: valid.room.id,
      status:
        offlinePaymentMethod || noDeposit
          ? "CONFIRMED"
          : "PENDING_DEPOSIT",
      paymentStatus: fullyPaidAtCreation ? "PAID" : "PENDING",
      startAt: input.startAt,
      endAt,
      durationMinutes: input.durationMinutes,
      baseAmountMad,
      depositPercent,
      depositAmountMad,
      totalAmountMad,
      commissionBps: finance.commissionBps,
      commissionAmountMad,
      studioNetAmountMad,
      promoDiscountMad,
      taxBps,
      taxAmountMad,
      notes: (input.notes || "").slice(0, 1500),
      expiresAt,
      flashSlotId: input.flashSlotId || null,
      addons: addonLines.length ? { create: addonLines } : undefined,
      payout: {
        create: {
          studioId: valid.room.studioId,
          grossAmountMad: totalAmountMad,
          commissionBps: finance.commissionBps,
          commissionAmountMad,
          netAmountMad: studioNetAmountMad,
          status: "PENDING",
        },
      },
      promoRedemption: promo ? { create: { promoId: promo.id, userId: input.creatorId, discountMad: promoDiscountMad } } : undefined,
      payments: {
        create: [
          ...(depositAmountMad > 0 ? [{
            kind: "DEPOSIT" as const,
            amountMad: depositAmountMad,
            status: "PENDING" as const,
            provider: paymentProvider,
          }] : []),
          ...(balanceAmountMad > 0 ? [{
            kind: "BALANCE" as const,
            amountMad: balanceAmountMad,
            status: "PENDING" as const,
            provider: paymentProvider,
          }] : []),
        ],
      },
    },
    include: { studio: true, room: true, payments: true, addons: true, payout: true },
  });
}

export async function createBookingHold(input: CreateBookingInput) {
  return db.$transaction(
    (tx) => createBookingHoldInTransaction(tx, input),
    { isolationLevel: "Serializable" },
  );
}


export async function createFlashBookingHold(input: {
  creatorId: string;
  flashSlotId: string;
}) {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${"flash:" + input.flashSlotId}))`;

    const flash = await tx.flashSlot.findFirst({
      where: {
        id: input.flashSlotId,
        status: "ACTIVE",
        expiresAt: { gt: new Date() },
        startAt: { gt: new Date() },
        room: { active: true, studio: { status: "VERIFIED" } },
      },
      include: { room: true },
    });

    if (!flash) throw new BookingConflictError("This 36 NOW slot is no longer available.");

    const durationMinutes = Math.round(
      (flash.endAt.getTime() - flash.startAt.getTime()) / 60000,
    );
    const totalAmountMad = Math.round(
      (flash.flashRateMad * durationMinutes) / 60,
    );

    const booking = await createBookingHoldInTransaction(tx, {
      creatorId: input.creatorId,
      roomId: flash.roomId,
      startAt: flash.startAt,
      durationMinutes,
      totalOverrideMad: totalAmountMad,
      flashSlotId: flash.id,
      notes: "Booked through 36 NOW",
    });

    await tx.flashSlot.update({
      where: { id: flash.id },
      data: { status: "BOOKED" },
    });

    return booking;
  }, { isolationLevel: "Serializable" });
}
