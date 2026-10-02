import type { Booking, Prisma } from "@prisma/client";

type RefundBookingSnapshot = Pick<
  Booking,
  "id" | "status" | "totalAmountMad" | "commissionAmountMad"
>;

export async function reconcileConfirmedRefund(
  tx: Prisma.TransactionClient,
  booking: RefundBookingSnapshot,
) {
  const [paidCharges, completedRefunds, pendingRefunds, payout] =
    await Promise.all([
      tx.payment.aggregate({
        where: {
          bookingId: booking.id,
          kind: { in: ["DEPOSIT", "BALANCE"] },
          status: "PAID",
        },
        _sum: { amountMad: true },
      }),
      tx.payment.aggregate({
        where: {
          bookingId: booking.id,
          kind: "REFUND",
          status: "REFUNDED",
        },
        _sum: { amountMad: true },
      }),
      tx.payment.count({
        where: {
          bookingId: booking.id,
          kind: "REFUND",
          status: "PENDING",
        },
      }),
      tx.payout.findUnique({
        where: { bookingId: booking.id },
      }),
    ]);

  const netCollected = Math.max(
    0,
    (paidCharges._sum.amountMad || 0) -
      (completedRefunds._sum.amountMad || 0),
  );

  const paymentStatus =
    netCollected >= booking.totalAmountMad
      ? "PAID"
      : netCollected > 0
        ? "PARTIALLY_PAID"
        : "REFUNDED";

  await tx.booking.update({
    where: { id: booking.id },
    data: { paymentStatus },
  });

  if (!payout || payout.status === "PAID") {
    return {
      netCollected,
      paymentStatus,
      payoutStatus: payout?.status || null,
    };
  }

  const retainedGrossMad = Math.min(
    booking.totalAmountMad,
    netCollected,
  );

  if (retainedGrossMad <= 0) {
    await tx.payout.delete({
      where: { id: payout.id },
    });

    return {
      netCollected,
      paymentStatus,
      payoutStatus: null,
    };
  }

  const commissionAmountMad =
    booking.totalAmountMad > 0
      ? Math.min(
          retainedGrossMad,
          Math.round(
            (booking.commissionAmountMad *
              retainedGrossMad) /
              booking.totalAmountMad,
          ),
        )
      : 0;
  const netAmountMad = Math.max(
    0,
    retainedGrossMad - commissionAmountMad,
  );

  const canBecomeEligible =
    pendingRefunds === 0 &&
    ["COMPLETED", "CANCELLED"].includes(booking.status);

  const payoutStatus =
    pendingRefunds > 0 || booking.status === "DISPUTED"
      ? "HOLD"
      : canBecomeEligible
        ? "ELIGIBLE"
        : "PENDING";

  await tx.payout.update({
    where: { id: payout.id },
    data: {
      grossAmountMad: retainedGrossMad,
      commissionAmountMad,
      netAmountMad,
      status: payoutStatus,
      availableAt:
        payoutStatus === "ELIGIBLE" ? new Date() : null,
    },
  });

  return {
    netCollected,
    paymentStatus,
    payoutStatus,
  };
}
