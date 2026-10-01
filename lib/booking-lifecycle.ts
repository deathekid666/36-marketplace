import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";

type ExpireOptions = {
  roomId?: string;
  creatorId?: string;
  ownerId?: string;
  limit?: number;
};

function staleWhere(
  now: Date,
  options: ExpireOptions,
): Prisma.BookingWhereInput {
  return {
    status: "PENDING_DEPOSIT",
    expiresAt: { lte: now },
    ...(options.roomId ? { roomId: options.roomId } : {}),
    ...(options.creatorId ? { creatorId: options.creatorId } : {}),
    ...(options.ownerId ? { studio: { ownerId: options.ownerId } } : {}),
  };
}

export async function expireStaleBookingHolds(
  options: ExpireOptions = {},
) {
  const now = new Date();
  const limit = Math.max(1, Math.min(250, options.limit || 100));

  const stale = await db.booking.findMany({
    where: staleWhere(now, options),
    orderBy: { expiresAt: "asc" },
    take: limit,
    select: {
      id: true,
      flashSlotId: true,
      flashSlot: {
        select: {
          id: true,
          status: true,
          startAt: true,
          expiresAt: true,
        },
      },
    },
  });

  let expired = 0;

  for (const booking of stale) {
    const changed = await db.$transaction(async (tx) => {
      const update = await tx.booking.updateMany({
        where: {
          id: booking.id,
          status: "PENDING_DEPOSIT",
          expiresAt: { lte: now },
        },
        data: {
          status: "EXPIRED",
          expiresAt: null,
        },
      });

      if (!update.count) return false;

      await tx.payment.updateMany({
        where: {
          bookingId: booking.id,
          status: "PENDING",
          kind: { not: "REFUND" },
        },
        data: { status: "FAILED" },
      });

      const paid = await tx.payment.aggregate({
        where: {
          bookingId: booking.id,
          kind: { in: ["DEPOSIT", "BALANCE"] },
          status: "PAID",
        },
        _sum: { amountMad: true },
      });
      const paidAmountMad = Math.max(0, paid._sum.amountMad || 0);

      if (paidAmountMad === 0) {
        await tx.payout.deleteMany({
          where: {
            bookingId: booking.id,
            status: { in: ["PENDING", "ELIGIBLE", "HOLD"] },
          },
        });
      } else {
        const currentPayout = await tx.payout.findUnique({
          where: { bookingId: booking.id },
        });
        if (currentPayout && currentPayout.status !== "PAID") {
          const grossAmountMad = Math.min(
            currentPayout.grossAmountMad,
            paidAmountMad,
          );
          const commissionAmountMad = Math.min(
            grossAmountMad,
            Math.round(
              (grossAmountMad * currentPayout.commissionBps) / 10000,
            ),
          );
          await tx.payout.update({
            where: { id: currentPayout.id },
            data: {
              grossAmountMad,
              commissionAmountMad,
              netAmountMad: Math.max(
                0,
                grossAmountMad - commissionAmountMad,
              ),
              status: "HOLD",
              availableAt: null,
            },
          });
        }
      }

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

      return true;
    });

    if (changed) expired += 1;
  }

  return expired;
}
