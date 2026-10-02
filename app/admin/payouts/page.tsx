import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { formatMoney } from "@/lib/commerce";
import { db } from "@/lib/db";
import {
  holdPayoutAction,
  markPayoutPaidAction,
  releasePayoutAction,
} from "./actions";

type CurrencyTotal = {
  currency: string;
  gross: number;
  fee: number;
  net: number;
};

export default async function AdminPayoutsPage() {
  const user = await requireRole("ADMIN");
  const [payouts, aggregateRows, payoutCount] = await Promise.all([
    db.payout.findMany({
      include: {
        studio: true,
        booking: { include: { creator: true, room: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.payout.groupBy({
      by: ["currency"],
      _sum: {
        grossAmountMad: true,
        commissionAmountMad: true,
        netAmountMad: true,
      },
    }),
    db.payout.count(),
  ]);

  const totals: CurrencyTotal[] = aggregateRows
    .map((row) => ({
      currency: row.currency || "USD",
      gross: row._sum.grossAmountMad || 0,
      fee: row._sum.commissionAmountMad || 0,
      net: row._sum.netAmountMad || 0,
    }))
    .sort((a, b) => a.currency.localeCompare(b.currency));

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-5 py-12">
        <Link href="/admin" className="text-xs font-bold text-zinc-500">
          ← Admin
        </Link>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-acid">
              Money movement
            </span>
            <h1 className="mt-2 text-4xl font-black">Payouts</h1>
            <p className="mt-2 text-xs text-zinc-500">
              Totals stay separated by currency so unlike currencies are never added together.
            </p>
          </div>
          <Link
            href="/admin/analytics"
            className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-bold"
          >
            Analytics
          </Link>
        </div>

        <div className="mt-8 space-y-4">
          {totals.length === 0 ? (
            <div className="panel text-sm text-zinc-600">No payouts yet.</div>
          ) : (
            totals.map((row) => (
              <section key={row.currency} className="panel">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-black">{row.currency}</h2>
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
                    Native currency
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {[
                    ["Gross booking value", row.gross],
                    ["36 commission", row.fee],
                    ["Studio net", row.net],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="rounded-xl border border-zinc-900 p-4">
                      <span className="label">{label}</span>
                      <b className="mt-2 block text-2xl">
                        {formatMoney(Number(value), row.currency)}
                      </b>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <p className="mt-8 text-[10px] text-zinc-600">
          Showing the latest {payouts.length} of {payoutCount} payout records. Totals above include all records.
        </p>

        <div className="mt-3 overflow-x-auto rounded-2xl border border-zinc-900">
          <table className="w-full min-w-[960px] text-left text-xs">
            <thead className="bg-zinc-950 text-zinc-500">
              <tr>
                <th className="p-4">Studio</th>
                <th>Booking</th>
                <th>Gross</th>
                <th>36 fee</th>
                <th>Studio net</th>
                <th>Currency</th>
                <th>Status</th>
                <th className="p-4">Action</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((payout) => (
                <tr key={payout.id} className="border-t border-zinc-900">
                  <td className="p-4">
                    <b>{payout.studio.name}</b>
                    <span className="block text-zinc-600">
                      {payout.booking.creator.name}
                    </span>
                  </td>
                  <td>
                    {payout.booking.room.name}
                    <span className="block text-zinc-600">
                      {payout.booking.status}
                    </span>
                  </td>
                  <td>{formatMoney(payout.grossAmountMad, payout.currency)}</td>
                  <td>
                    {formatMoney(payout.commissionAmountMad, payout.currency)}
                    <span className="block text-zinc-600">
                      {(payout.commissionBps / 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="font-bold text-acid">
                    {formatMoney(payout.netAmountMad, payout.currency)}
                  </td>
                  <td>{payout.currency}</td>
                  <td>{payout.status}</td>
                  <td className="p-4">
                    {payout.status === "ELIGIBLE" ? (
                      <form action={markPayoutPaidAction} className="flex gap-2">
                        <input type="hidden" name="payoutId" value={payout.id} />
                        <input
                          name="reference"
                          className="field py-2"
                          placeholder="Transfer ref"
                          required
                        />
                        <button className="rounded-lg bg-acid px-3 py-2 font-black text-black">
                          Mark paid
                        </button>
                      </form>
                    ) : payout.status === "HOLD" ? (
                      <form action={releasePayoutAction}>
                        <input type="hidden" name="payoutId" value={payout.id} />
                        <button className="text-acid">Release hold</button>
                      </form>
                    ) : payout.status === "PENDING" ? (
                      <form action={holdPayoutAction}>
                        <input type="hidden" name="payoutId" value={payout.id} />
                        <button className="text-zinc-500">Place hold</button>
                      </form>
                    ) : (
                      <span className="text-zinc-600">
                        {payout.reference || "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
