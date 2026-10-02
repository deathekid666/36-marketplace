import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMad } from "@/lib/finance";
import {
  formatMarketplaceDateTime,
  studioTimeZone,
} from "@/lib/time";

function payoutTone(status: string) {
  if (status === "PAID") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "ELIGIBLE") return "border-acid/40 bg-acid/[0.06] text-[#4b5d00]";
  if (status === "HOLD") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-[#dddddd] bg-[#f7f7f7] text-[#717171]";
}

export default async function OwnerRevenuePage() {
  const user = await requireRole("STUDIO_OWNER");
  const studios = await db.studio.findMany({
    where: { ownerId: user.id },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const ids = studios.map((studio) => studio.id);

  const [bookings, payouts] = await Promise.all([
    db.booking.findMany({
      where: { studioId: { in: ids } },
      include: { studio: true, room: true },
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
    db.payout.findMany({
      where: { studioId: { in: ids } },
      include: {
        studio: {
          select: {
            name: true,
            latitude: true,
            longitude: true,
          },
        },
        booking: { select: { id: true, startAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 250,
    }),
  ]);

  const active = bookings.filter((booking) =>
    ["CONFIRMED", "COMPLETED"].includes(booking.status),
  );
  const gross = active.reduce((sum, booking) => sum + booking.totalAmountMad, 0);
  const fee = active.reduce((sum, booking) => sum + booking.commissionAmountMad, 0);
  const net = active.reduce((sum, booking) => sum + booking.studioNetAmountMad, 0);

  const payoutTotals = {
    pending: payouts
      .filter((payout) => payout.status === "PENDING")
      .reduce((sum, payout) => sum + payout.netAmountMad, 0),
    eligible: payouts
      .filter((payout) => payout.status === "ELIGIBLE")
      .reduce((sum, payout) => sum + payout.netAmountMad, 0),
    paid: payouts
      .filter((payout) => payout.status === "PAID")
      .reduce((sum, payout) => sum + payout.netAmountMad, 0),
    hold: payouts
      .filter((payout) => payout.status === "HOLD")
      .reduce((sum, payout) => sum + payout.netAmountMad, 0),
  };

  const unpaidBookings = bookings.filter(
    (booking) =>
      ["PENDING", "PARTIALLY_PAID"].includes(booking.paymentStatus) &&
      !["CANCELLED", "EXPIRED"].includes(booking.status),
  );

  return (
    <main className="min-h-screen bg-[#f7f7f7] text-[#222]">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-5 py-10 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link href="/owner" className="text-xs font-bold text-[#717171]">
              ← Dashboard
            </Link>
            <span className="mt-6 block text-xs font-bold uppercase tracking-[0.2em] text-acid">
              Revenue & payouts
            </span>
            <h1 className="mt-2 text-4xl font-black tracking-[-0.045em]">
              Money dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#717171]">
              Booking value, 36 commission, studio net and payout status across all your studios.
            </p>
          </div>
          <Link
            href="/owner/bookings"
            className="rounded-full border border-[#d8d8d8] bg-white px-5 py-3 text-xs font-black"
          >
            Booking payments
          </Link>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["Gross booking value", gross, "Confirmed + completed"],
            ["36 commission", fee, "Marketplace fee"],
            ["Studio net", net, "After 36 commission"],
            ["Eligible now", payoutTotals.eligible, "Ready to be paid"],
            ["Paid out", payoutTotals.paid, "Completed transfers"],
          ].map(([label, value, note]) => (
            <article key={String(label)} className="rounded-2xl border border-[#e7e7e7] bg-white p-5">
              <span className="label">{label}</span>
              <b className="mt-3 block text-2xl">{formatMad(Number(value))}</b>
              <span className="mt-1 block text-[10px] text-[#8a8a8a]">{String(note)}</span>
            </article>
          ))}
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <article className="rounded-2xl border border-[#e7e7e7] bg-white p-5">
            <span className="label">Pending payout</span>
            <b className="mt-2 block text-2xl">{formatMad(payoutTotals.pending)}</b>
            <p className="mt-1 text-[10px] text-[#8a8a8a]">
              Becomes eligible after a paid session is completed.
            </p>
          </article>
          <article className="rounded-2xl border border-[#e7e7e7] bg-white p-5">
            <span className="label">On hold</span>
            <b className="mt-2 block text-2xl">{formatMad(payoutTotals.hold)}</b>
            <p className="mt-1 text-[10px] text-[#8a8a8a]">
              Held for dispute, cancellation or payment review.
            </p>
          </article>
          <article className="rounded-2xl border border-[#e7e7e7] bg-white p-5">
            <span className="label">Awaiting studio collection</span>
            <b className="mt-2 block text-2xl">{unpaidBookings.length}</b>
            <p className="mt-1 text-[10px] text-[#8a8a8a]">
              Offline or partially paid bookings needing payment completion.
            </p>
          </article>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
          <section className="overflow-hidden rounded-3xl border border-[#e7e7e7] bg-white">
            <div className="flex items-end justify-between gap-4 border-b border-[#eeeeee] p-5">
              <div>
                <span className="label">Payout history</span>
                <h2 className="text-xl font-black">Studio transfers</h2>
              </div>
              <span className="text-[10px] text-[#8a8a8a]">{payouts.length} records</span>
            </div>

            {payouts.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#8a8a8a]">
                No payout records yet. They are created from confirmed bookings.
              </div>
            ) : (
              <div className="divide-y divide-[#eeeeee]">
                {payouts.slice(0, 40).map((payout) => (
                  <div key={payout.id} className="grid gap-3 p-5 sm:grid-cols-[1fr_auto]">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <b>{payout.studio.name}</b>
                        <span className={"rounded-full border px-2.5 py-1 text-[9px] font-black " + payoutTone(payout.status)}>
                          {payout.status}
                        </span>
                      </div>
                      <span className="mt-1 block text-[10px] text-[#8a8a8a]">
                        Session {formatMarketplaceDateTime(
                          payout.booking.startAt,
                          studioTimeZone(payout.studio),
                        )}
                      </span>
                      {payout.reference && (
                        <span className="mt-1 block text-[10px] text-[#a3a3a3]">
                          Transfer ref: {payout.reference}
                        </span>
                      )}
                    </div>
                    <div className="text-left sm:text-right">
                      <b className="text-lg">{formatMad(payout.netAmountMad)}</b>
                      <span className="block text-[10px] text-[#8a8a8a]">
                        {formatMad(payout.grossAmountMad)} gross · {formatMad(payout.commissionAmountMad)} fee
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="overflow-hidden rounded-3xl border border-[#e7e7e7] bg-white">
            <div className="border-b border-[#eeeeee] p-5">
              <span className="label">Recent booking payments</span>
              <h2 className="text-xl font-black">Collection status</h2>
            </div>
            <div className="divide-y divide-[#eeeeee]">
              {bookings.length === 0 ? (
                <div className="p-8 text-sm text-[#8a8a8a]">No bookings yet.</div>
              ) : (
                bookings.slice(0, 30).map((booking) => (
                  <Link
                    key={booking.id}
                    href={"/owner/bookings/" + booking.id}
                    className="grid gap-3 p-5 transition hover:bg-[#fafafa] sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <b>{booking.studio.name}</b>
                      <span className="mt-1 block text-[10px] text-[#8a8a8a]">
                        {booking.room.name} · {booking.status.replaceAll("_", " ")}
                      </span>
                      <span className="mt-1 block text-[10px] font-black uppercase tracking-[0.08em] text-[#717171]">
                        {booking.paymentStatus.replaceAll("_", " ")}
                      </span>
                    </div>
                    <div className="text-left sm:text-right">
                      <b>{formatMad(booking.totalAmountMad)}</b>
                      <span className="block text-[10px] text-acid">
                        Net {formatMad(booking.studioNetAmountMad)}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="mt-6 rounded-2xl border border-[#e7e7e7] bg-white p-5 text-xs leading-6 text-[#717171]">
          36 currently supports the existing offline payment workflow without requiring a paid card gateway.
          When an online provider is connected, the same Payment and Payout records already support webhook-confirmed payment,
          refunds, payout eligibility and transfer references.
        </div>
      </section>
    </main>
  );
}
