"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/commerce";
import { notifyUser } from "@/lib/notifications";

function text(form: FormData, name: string, max = 300) {
  return String(form.get(name) || "").trim().slice(0, max);
}

function disputeBlocksPayout(
  dispute:
    | {
        status: string;
      }
    | null,
  hasPendingRefund: boolean,
) {
  if (hasPendingRefund) return true;
  return Boolean(
    dispute &&
      ["OPEN", "UNDER_REVIEW"].includes(dispute.status),
  );
}

function payoutCanBeEligible(payout: {
  grossAmountMad: number;
  booking: {
    status: string;
    paymentStatus: string;
    dispute:
      | {
          status: string;
        }
      | null;
    payments: Array<{
      kind: string;
      status: string;
    }>;
  };
}) {
  const hasPendingRefund = payout.booking.payments.some(
    (payment) =>
      payment.kind === "REFUND" &&
      payment.status === "PENDING",
  );
  if (
    disputeBlocksPayout(
      payout.booking.dispute,
      hasPendingRefund,
    )
  ) {
    return false;
  }
  if (payout.grossAmountMad <= 0) return false;

  if (
    payout.booking.status === "COMPLETED" &&
    ["PAID", "PARTIALLY_PAID"].includes(
      payout.booking.paymentStatus,
    )
  ) {
    return true;
  }

  return (
    payout.booking.status === "CANCELLED" &&
    ["PAID", "PARTIALLY_PAID"].includes(payout.booking.paymentStatus)
  );
}

export async function markPayoutPaidAction(form: FormData) {
  await requireRole("ADMIN");
  const payoutId = text(form, "payoutId", 80);
  const reference = text(form, "reference", 200);

  if (!reference) {
    redirect("/admin/payouts?error=reference");
  }

  const payout = await db.payout.findFirst({
    where: { id: payoutId, status: "ELIGIBLE" },
    include: {
      studio: true,
      booking: {
        include: {
          dispute: true,
          payments: {
            where: {
              kind: "REFUND",
              status: "PENDING",
            },
            select: {
              kind: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!payout || !payoutCanBeEligible(payout)) {
    redirect("/admin/payouts?error=blocked");
  }

  const changed = await db.payout.updateMany({
    where: {
      id: payout.id,
      status: "ELIGIBLE",
    },
    data: {
      status: "PAID",
      paidAt: new Date(),
      reference,
    },
  });

  if (!changed.count) {
    redirect("/admin/payouts?error=changed");
  }

  await notifyUser({
    userId: payout.studio.ownerId,
    type: "PAYOUT_PAID",
    title: "36 payout marked paid",
    body:
      formatMoney(payout.netAmountMad, payout.currency) +
      " for booking " +
      payout.bookingId.slice(0, 8) +
      ".",
    href: "/owner/revenue",
    email: true,
  });

  revalidatePath("/admin/payouts");
  revalidatePath("/owner/revenue");
  redirect("/admin/payouts?paid=1");
}

export async function holdPayoutAction(form: FormData) {
  await requireRole("ADMIN");
  const payoutId = text(form, "payoutId", 80);

  await db.payout.updateMany({
    where: {
      id: payoutId,
      status: { in: ["PENDING", "ELIGIBLE"] },
    },
    data: {
      status: "HOLD",
      availableAt: null,
    },
  });

  revalidatePath("/admin/payouts");
  revalidatePath("/owner/revenue");
}

export async function releasePayoutAction(form: FormData) {
  await requireRole("ADMIN");
  const payoutId = text(form, "payoutId", 80);

  const payout = await db.payout.findFirst({
    where: {
      id: payoutId,
      status: "HOLD",
    },
    include: {
      booking: {
        include: {
          dispute: true,
          payments: {
            where: {
              kind: "REFUND",
              status: "PENDING",
            },
            select: {
              kind: true,
              status: true,
            },
          },
        },
      },
    },
  });

  if (!payout) return;

  if (payoutCanBeEligible(payout)) {
    await db.payout.updateMany({
      where: {
        id: payout.id,
        status: "HOLD",
      },
      data: {
        status: "ELIGIBLE",
        availableAt: new Date(),
      },
    });
  } else if (
    !disputeBlocksPayout(
      payout.booking.dispute,
      payout.booking.payments.length > 0,
    ) &&
    !["CANCELLED", "DISPUTED"].includes(
      payout.booking.status,
    ) &&
    !["REFUNDED", "FAILED"].includes(
      payout.booking.paymentStatus,
    )
  ) {
    await db.payout.updateMany({
      where: {
        id: payout.id,
        status: "HOLD",
      },
      data: {
        status: "PENDING",
        availableAt: null,
      },
    });
  }

  revalidatePath("/admin/payouts");
  revalidatePath("/owner/revenue");
}
