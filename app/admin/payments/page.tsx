import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { confirmBalanceAction, confirmDepositAction, confirmRefundAction, setPaymentLinkAction } from "@/app/admin/payment-actions";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/commerce";
import { formatMarketplaceDateTime } from "@/lib/time";

export default async function AdminPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ confirmed?: string; balance?: string; refunded?: string; linked?: string; error?: string }>;
}) {
  const user = await requireRole("ADMIN");
  const query = await searchParams;
  const [deposits, balances, refunds] = await Promise.all([
    db.payment.findMany({
      where: { kind: "DEPOSIT", status: "PENDING", booking: { status: "PENDING_DEPOSIT" } },
      orderBy: { createdAt: "asc" },
      include: { booking: { include: { creator: true, studio: true, room: true } } },
    }),
    db.payment.findMany({
      where: { kind: "BALANCE", status: "PENDING", booking: { status: "CONFIRMED" } },
      orderBy: { createdAt: "asc" },
      include: { booking: { include: { creator: true, studio: true, room: true } } },
    }),
    db.payment.findMany({
      where: { kind: "REFUND", status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { booking: { include: { creator: true, studio: true, room: true } } },
    }),
  ]);

  return <main className="min-h-screen"><AppHeader user={user} /><section className="mx-auto max-w-6xl px-5 py-12"><div className="flex flex-wrap items-end justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[0.18em] text-acid">Transaction control</span><h1 className="mt-3 text-4xl font-black tracking-[-0.045em]">Payments</h1><p className="mt-3 max-w-2xl text-sm text-zinc-500">Use provider checkout links now; the normalized signed webhook is ready for a direct Payzone/NAPS/CMI merchant adapter once credentials and technical documentation are issued.</p></div><Link href="/admin" className="text-xs font-bold text-zinc-500">← Admin</Link></div>
  {(query.confirmed || query.balance || query.refunded || query.linked) && <div className="mt-6 rounded-xl border border-acid/30 bg-acid/[0.04] p-4 text-sm text-acid">{query.refunded ? "Refund marked completed." : query.balance ? "Balance confirmed; booking is fully paid." : query.linked ? "Secure checkout link attached." : "Deposit confirmed; booking is now confirmed."}</div>}{query.error && <div className="mt-6 rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">Payment action failed. Check the hold, link or provider reference.</div>}

  <section className="mt-8"><div className="flex items-center justify-between"><h2 className="text-xl font-black">Deposits awaiting payment</h2><span className="text-xs text-zinc-600">{deposits.length}</span></div><div className="mt-4 space-y-4">{deposits.length === 0 ? <div className="panel text-center text-sm text-zinc-600">No pending deposits.</div> : deposits.map((payment) => { const expired = !!payment.booking.expiresAt && payment.booking.expiresAt <= new Date(); return <article key={payment.id} className="panel"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className={`text-[10px] font-bold uppercase tracking-[0.14em] ${expired ? "text-red-400" : "text-acid"}`}>{expired ? "Hold expired" : "Pending deposit"}</span><h3 className="mt-2 text-xl font-black">{payment.booking.studio.name} · {payment.booking.room.name}</h3><p className="mt-1 text-xs text-zinc-500">{payment.booking.creator.name} · {payment.booking.creator.email}</p><p className="mt-1 text-xs text-zinc-600">Session {formatMarketplaceDateTime(payment.booking.startAt)} · hold {payment.booking.expiresAt ? `until ${formatMarketplaceDateTime(payment.booking.expiresAt)}` : "—"}</p></div><div className="text-right"><b className="text-2xl">{formatMoney(payment.amountMad, payment.currency)}</b><span className="block text-xs text-zinc-600">deposit</span></div></div>
  {!expired && <div className="mt-5 grid gap-3 lg:grid-cols-2"><form action={setPaymentLinkAction} className="rounded-xl border border-zinc-900 p-4"><input type="hidden" name="paymentId" value={payment.id} /><input type="hidden" name="provider" value="PAYMENT_LINK" /><span className="label">Secure checkout URL</span><div className="flex gap-2"><input className="field" type="url" name="checkoutUrl" defaultValue={payment.checkoutUrl} placeholder="https://payment-provider/checkout/..." required /><button className="button-dark whitespace-nowrap">Attach link</button></div></form><form action={confirmDepositAction} className="rounded-xl border border-zinc-900 p-4"><span className="label">Manual / provider confirmation</span><div className="flex gap-2"><input type="hidden" name="paymentId" value={payment.id} /><input className="field" name="providerRef" placeholder="Transaction / receipt reference" required /><button className="rounded-xl bg-acid px-4 text-xs font-black text-black whitespace-nowrap">Confirm received</button></div></form></div>}</article>; })}</div></section>

  <section className="mt-10"><div className="flex items-center justify-between"><h2 className="text-xl font-black">Balances awaiting payment</h2><span className="text-xs text-zinc-600">{balances.length}</span></div><div className="mt-4 space-y-4">{balances.length === 0 ? <div className="panel text-center text-sm text-zinc-600">No booking balances waiting.</div> : balances.map((payment) => <article key={payment.id} className="panel"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-acid">Confirmed booking · balance due</span><h3 className="mt-2 text-xl font-black">{payment.booking.studio.name} · {payment.booking.room.name}</h3><p className="mt-1 text-xs text-zinc-500">{payment.booking.creator.name} · {formatMarketplaceDateTime(payment.booking.startAt)}</p></div><div className="text-right"><b className="text-2xl">{formatMoney(payment.amountMad, payment.currency)}</b><span className="block text-xs text-zinc-600">balance</span></div></div><div className="mt-5 grid gap-3 lg:grid-cols-2"><form action={setPaymentLinkAction} className="rounded-xl border border-zinc-900 p-4"><input type="hidden" name="paymentId" value={payment.id} /><input type="hidden" name="provider" value="PAYMENT_LINK" /><span className="label">Secure checkout URL</span><div className="flex gap-2"><input className="field" type="url" name="checkoutUrl" defaultValue={payment.checkoutUrl} placeholder="https://payment-provider/checkout/..." required /><button className="button-dark whitespace-nowrap">Attach link</button></div></form><form action={confirmBalanceAction} className="rounded-xl border border-zinc-900 p-4"><span className="label">Confirm balance received</span><div className="flex gap-2"><input type="hidden" name="paymentId" value={payment.id} /><input className="field" name="providerRef" placeholder="Transaction / receipt reference" required /><button className="rounded-xl bg-acid px-4 text-xs font-black text-black whitespace-nowrap">Confirm paid</button></div></form></div></article>)}</div></section>

  <section className="mt-10"><div className="flex items-center justify-between"><h2 className="text-xl font-black">Refund queue</h2><span className="text-xs text-zinc-600">{refunds.length}</span></div><div className="mt-4 space-y-4">{refunds.length === 0 ? <div className="panel text-center text-sm text-zinc-600">No refunds waiting.</div> : refunds.map((refund) => <article key={refund.id} className="panel"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">Refund required</span><h3 className="mt-2 text-xl font-black">{refund.booking.creator.name} · {refund.booking.studio.name}</h3><p className="mt-1 text-xs text-zinc-600">Booking {refund.booking.id.slice(0, 8)} · {refund.provider}</p></div><b className="text-2xl text-amber-200">{formatMoney(refund.amountMad, refund.currency)}</b></div><form action={confirmRefundAction} className="mt-5 flex gap-2"><input type="hidden" name="paymentId" value={refund.id} /><input className="field" name="providerRef" placeholder="Refund transaction reference" required /><button className="rounded-xl bg-acid px-4 text-xs font-black text-black whitespace-nowrap">Mark refunded</button></form></article>)}</div></section>
  </section></main>;
}
