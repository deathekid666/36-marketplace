import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { formatMoney } from "@/lib/commerce";
import { db } from "@/lib/db";
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

type MoneyRow = {
  currency: string;
  gross: number;
  fee: number;
  net: number;
  pending: number;
  eligible: number;
  paid: number;
  hold: number;
};

function currencySummary(
  bookings: Array<{
    status: string;
    currency: string;
    totalAmountMad: number;
    commissionAmountMad: number;
    studioNetAmountMad: number;
  }>,
  payouts: Array<{
    status: string;
    currency: string;
    netAmountMad: number;
  }>,
) {
  const rows = new Map<string, MoneyRow>();

  const get = (currency: string) => {
    const key = currency || "USD";
    const existing = rows.get(key);
    if (existing) return existing;
    const created: MoneyRow = {
      currency: key,
      gross: 0,
      fee: 0,
      net: 0,
      pending: 0,
      eligible: 0,
      paid: 0,
      hold: 0,
    };
    rows.set(key, created);
    return created;
  };

  for (const booking of bookings) {
    if (!["CONFIRMED", "COMPLETED"].includes(booking.status)) continue;
    const row = get(booking.currency);
    row.gross += booking.totalAmountMad;
    row.fee += booking.commissionAmountMad;
    row.net += booking.studioNetAmountMad;
  }

  for (const payout of payouts) {
    const row = get(payout.currency);
    if (payout.status === "PENDING") row.pending += payout.netAmountMad;
    if (payout.status === "ELIGIBLE") row.eligible += payout.netAmountMad;
    if (payout.status === "PAID") row.paid += payout.netAmountMad;
    if (payout.status === "HOLD") row.hold += payout.netAmountMad;
  }

  return [...rows.values()].sort((a, b) =>
    a.currency.localeCompare(b.currency),
  );
}

export default async function OwnerRevenuePage() {
  const user = await requireRole("STUDIO_OWNER");
  const studios = await db.studio.findMany({
    where: { ownerId: user.id },
    select: { id: true, name: true, currency: true },
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
            timeZone: true,
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

  const summaries = currencySummary(bookings, payouts);
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
              Every currency is reported separately. 36 never adds EUR, USD,
              MAD or other currencies into a misleading combined total.
            </p>
          </div>
          <Link
            href="/owner/bookings"
            className="rounded-full border border-[#d8d8d8] bg-white px-5 py-3 text-xs font-black"
          >
            Booking payments
          </Link>
        </div>

        {summaries.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-[#d8d8d8] bg-white p-10 text-center text-sm text-[#8a8a8a]">
            Revenue will appear here after your first booking.
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {summaries.map((row) => (
              <section
                key={row.currency}
                className="rounded-3xl border border-[#e7e7e7] bg-white p-5 sm:p-6"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <span className="label">Native currency</span>
                    <h2 className="mt-1 text-2xl font-black">{row.currency}</h2>
                  </div>
                  <span className="rounded-full bg-[#f4f4f4] px-3 py-1.5 text-[10px] font-black text-[#717171]">
                    No FX conversion
                  </span>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {[
                    ["Gross booking value", row.gross, "Confirmed + completed"],
                    ["36 commission", row.fee, "Marketplace fee"],
                    ["Studio net", row.net, "After 36 commission"],
                    ["Eligible now", row.eligible, "Ready to be paid"],
                  ].map(([label, value, note]) => (
                    <article
                      key={String(label)}
                      className="rounded-2xl border border-[#eeeeee] bg-[#fafafa] p-4"
                    >
                      <span className="label">{label}</span>
                      <b className="mt-2 block text-xl">
                        {formatMoney(Number(value), row.currency)}
                      </b>
                      <span className="mt-1 block text-[10px] text-[#8a8a8a]">
                        {String(note)}
                      </span>
                    </article>
                  ))}
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-[#eeeeee] p-4">
                    <span className="label">Pending</span>
                    <b className="mt-2 block">
                      {formatMoney(row.pending, row.currency)}
                    </b>
                  </div>
                  <div className="rounded-2xl border border-[#eeeeee] p-4">
                    <span className="label">On hold</span>
                    <b className="mt-2 block">
                      {formatMoney(row.hold, row.currency)}
                    </b>
                  </div>
                  <div className="rounded-2xl border border-[#eeeeee] p-4">
                    <span className="label">Paid out</span>
                    <b className="mt-2 block">
                      {formatMoney(row.paid, row.currency)}
                    </b>
                  </div>
                </div>
              </section>
            ))}
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-[#e7e7e7] bg-white p-5">
          <span className="label">Awaiting studio collection</span>
          <b className="mt-2 block text-2xl">{unpaidBookings.length}</b>
          <p className="mt-1 text-[10px] text-[#8a8a8a]">
            Offline or partially paid bookings needing payment completion.
          </p>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
          <section className="overflow-hidden rounded-3xl border border-[#e7e7e7] bg-white">
            <div className="flex items-end justify-between gap-4 border-b border-[#eeeeee] p-5">
              <div>
                <span className="label">Payout history</span>
                <h2 className="text-xl font-black">Studio transfers</h2>
              </div>
              <span className="text-[10px] text-[#8a8a8a]">
                {payouts.length} records
              </span>
            </div>

            {payouts.length === 0 ? (
              <div className="p-10 text-center text-sm text-[#8a8a8a]">
                No payout records yet.
              </div>
            ) : (
              <div className="divide-y divide-[#eeeeee]">
                {payouts.slice(0, 40).map((payout) => (
                  <div
                    key={payout.id}
                    className="grid gap-3 p-5 sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <b>{payout.studio.name}</b>
                        <span
                          className={
                            "rounded-full border px-2.5 py-1 text-[9px] font-black " +
                            payoutTone(payout.status)
                          }
                        >
                          {payout.status}
                        </span>
                        <span className="rounded-full bg-[#f3f3f3] px-2 py-1 text-[9px] font-black text-[#717171]">
                          {payout.currency}
                        </span>
                      </div>
                      <span className="mt-1 block text-[10px] text-[#8a8a8a]">
                        Session{" "}
                        {formatMarketplaceDateTime(
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
                      <b className="text-lg">
                        {formatMoney(payout.netAmountMad, payout.currency)}
                      </b>
                      <span className="block text-[10px] text-[#8a8a8a]">
                        {formatMoney(payout.grossAmountMad, payout.currency)} gross ·{" "}
                        {formatMoney(payout.commissionAmountMad, payout.currency)} fee
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
                <div className="p-8 text-sm text-[#8a8a8a]">
                  No bookings yet.
                </div>
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
                        {booking.paymentStatus.replaceAll("_", " ")} · {booking.currency}
                      </span>
                    </div>
                    <div className="text-left sm:text-right">
                      <b>{formatMoney(booking.totalAmountMad, booking.currency)}</b>
                      <span className="block text-[10px] text-acid">
                        Net {formatMoney(booking.studioNetAmountMad, booking.currency)}
                      </span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="mt-6 rounded-2xl border border-[#e7e7e7] bg-white p-5 text-xs leading-6 text-[#717171]">
          Existing offline payment methods remain available. Each booking,
          payment, payout and invoice now keeps its own currency snapshot so
          later studio changes cannot rewrite historical money records.
        </div>
      </section>
    </main>
  );
}
