import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { releaseBookingHoldAction } from "@/app/creator/actions";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMarketplaceDateTime } from "@/lib/time";
import { offlinePaymentLabel } from "@/lib/offline-payment";

function effectiveStatus(booking: { status: string; expiresAt: Date | null }) {
  if (booking.status === "PENDING_DEPOSIT" && booking.expiresAt && booking.expiresAt <= new Date()) return "EXPIRED";
  return booking.status;
}

export default async function CreatorBookingsPage({ searchParams }: { searchParams: Promise<{ booking?: string; from?: string; released?: string }> }) {
  const user = await requireRole("CREATOR");
  const query = await searchParams;
  const bookings = await db.booking.findMany({
    where: { creatorId: user.id },
    orderBy: { createdAt: "desc" },
    include: { studio: true, room: true, payments: { orderBy: { createdAt: "desc" } } },
  });

  return (
    <main className="min-h-screen"><AppHeader user={user} /><section className="mx-auto max-w-6xl px-5 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[0.18em] text-acid">Creator bookings</span><h1 className="mt-3 text-4xl font-black tracking-[-0.045em]">Your sessions</h1><p className="mt-3 text-sm text-zinc-500">Reservations, deposits and confirmed studio time.</p></div><Link href="/studios" className="rounded-full bg-acid px-5 py-3 text-sm font-black text-black">Find another studio</Link></div>
      {query.booking && <div className="mt-6 rounded-xl border border-acid/30 bg-acid/[0.04] p-4 text-sm text-acid">Slot reserved. Complete the deposit before the hold expires.</div>}
      {query.released && <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-sm text-zinc-300">Booking hold released. The room is available again.</div>}
      <div className="mt-8 space-y-4">{bookings.length === 0 ? <div className="panel text-center"><h2 className="font-black">No bookings yet</h2><p className="mt-2 text-sm text-zinc-600">Choose a verified studio and reserve a live slot.</p></div> : bookings.map((booking) => {
        const status = effectiveStatus(booking);
        const pending = status === "PENDING_DEPOSIT";
        const deposit = booking.payments.find((p) => p.kind === "DEPOSIT");
        const balance = booking.payments.find((p) => p.kind === "BALANCE");
        const offlineMethod = offlinePaymentLabel(
          booking.payments.find((p) => offlinePaymentLabel(p.provider))?.provider,
        );
        return <article key={booking.id} className={`rounded-2xl border p-6 ${booking.id === query.booking ? "border-acid/40 bg-acid/[0.025]" : "border-zinc-900 bg-zinc-950/70"}`}>
          <div className="flex flex-wrap items-start justify-between gap-5"><div><span className="text-[10px] font-bold uppercase tracking-[0.15em] text-acid">{status.replaceAll("_", " ")}</span><h2 className="mt-2 text-2xl font-black">{booking.studio.name}</h2><p className="mt-1 text-sm text-zinc-500">{booking.room.name} · {formatMarketplaceDateTime(booking.startAt)} → {formatMarketplaceDateTime(booking.endAt)}</p></div><div className="text-right"><b className="text-xl">{booking.totalAmountMad} MAD</b><span className="block text-xs text-zinc-600">total</span></div></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-4"><div className="rounded-xl bg-black/30 p-4"><span className="label">{offlineMethod ? "Method" : "Deposit"}</span><b>{offlineMethod || (booking.depositAmountMad + " MAD · " + (deposit?.status || (booking.depositAmountMad === 0 ? "N/A" : "PENDING")))}</b></div><div className="rounded-xl bg-black/30 p-4"><span className="label">Balance</span><b>{balance ? `${balance.amountMad} MAD · ${balance.status}` : "0 MAD"}</b></div><div className="rounded-xl bg-black/30 p-4"><span className="label">Payment</span><b>{booking.paymentStatus}</b></div><div className="rounded-xl bg-black/30 p-4"><span className="label">{offlineMethod ? "Booking" : "Hold"}</span><b>{offlineMethod ? "Confirmed" : pending && booking.expiresAt ? `until ${formatMarketplaceDateTime(booking.expiresAt)}` : status === "CONFIRMED" ? "Confirmed" : "—"}</b></div></div>
          {offlineMethod && booking.paymentStatus !== "PAID" && <div className="mt-4 rounded-xl border border-emerald-900/35 bg-emerald-950/10 p-4 text-xs leading-5 text-emerald-300">Confirmed with {offlineMethod}. Pay {booking.totalAmountMad} MAD directly to the studio; the owner will mark it received in 36.</div>}
          {pending && <div className="mt-4 rounded-xl border border-amber-800/40 bg-amber-950/15 p-4 text-xs leading-5 text-amber-200">This older booking still uses the deposit-hold workflow. The slot remains protected only until the hold expires.</div>}
          <div className="mt-4 flex flex-wrap items-center gap-4"><Link href={`/creator/bookings/${booking.id}`} className="text-xs font-black text-acid">Open booking →</Link>{pending && <form action={releaseBookingHoldAction}><input type="hidden" name="bookingId" value={booking.id} /><button className="text-xs font-bold text-zinc-500 hover:text-red-300">Release this hold</button></form>}</div>
        </article>;
      })}</div>
    </section></main>
  );
}
