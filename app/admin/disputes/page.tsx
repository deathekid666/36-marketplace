import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { resolveDisputeAction } from "@/app/disputes/actions";
import { formatMoney } from "@/lib/commerce";
import {
  formatMarketplaceDateTime,
  studioTimeZone,
} from "@/lib/time";

export const metadata = { title: "Disputes" };

export default async function Page() {
  const user = await requireRole("ADMIN");
  const disputes = await db.dispute.findMany({
    include: { openedBy: true, booking: { include: { creator: true, studio: true, room: true } } },
    orderBy: { createdAt: "desc" },
  });
  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-6xl px-5 py-10">
        <span className="text-xs font-bold uppercase tracking-[.16em] text-acid">Trust & safety</span>
        <h1 className="mt-3 text-4xl font-black">Disputes</h1>
        <div className="mt-7 space-y-4">
          {disputes.length === 0 ? <div className="panel text-sm text-zinc-600">No disputes.</div> : disputes.map((d) => (
            <article key={d.id} className="panel">
              <div className="flex flex-wrap justify-between gap-4">
                <div><span className="text-xs font-bold text-acid">{d.status}</span><h2 className="mt-1 text-xl font-black">{d.reason}</h2><p className="mt-2 text-xs text-zinc-600">{d.booking.studio.name} · {d.booking.room.name} · {d.booking.creator.name} · {formatMarketplaceDateTime(
                  d.booking.startAt,
                  studioTimeZone(d.booking.studio),
                )}</p></div>
                <b>{formatMoney(d.booking.totalAmountMad, d.booking.currency)}</b>
              </div>
              {d.details && <p className="mt-4 text-sm leading-6 text-zinc-400">{d.details}</p>}
              {["OPEN", "UNDER_REVIEW"].includes(d.status) ? (
                <form action={resolveDisputeAction} className="mt-5 grid gap-3 sm:grid-cols-[1fr_160px_130px_auto]">
                  <input type="hidden" name="disputeId" value={d.id} />
                  <input className="field" name="resolution" placeholder="Resolution / admin note" required />
                  <label>
                    <span className="label">Refund · {d.booking.currency}</span>
                    <input className="field" name="refundAmountMad" type="number" min="0" max={d.booking.totalAmountMad} defaultValue="0" />
                  </label>
                  <select className="field" name="status"><option value="RESOLVED">Resolve</option><option value="REJECTED">Reject</option></select>
                  <button className="button-dark">Save</button>
                </form>
              ) : <div className="mt-4 rounded-xl bg-zinc-900 p-4 text-sm text-zinc-400">{d.resolution || "Resolved"}{d.refundAmountMad > 0 && <b className="ml-2 text-acid">
                  Refund {formatMoney(d.refundAmountMad, d.booking.currency)}
                </b>}</div>}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
