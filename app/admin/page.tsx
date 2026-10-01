import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { StudioStatusBadge } from "@/components/StudioStatusBadge";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { categoryLabel } from "@/lib/studio";

export default async function AdminPage() {
  const user = await requireRole("ADMIN");
  const [submitted, verified, rejected, totals, pendingDeposits, pendingBalances, pendingRefunds, liveNow, discoveryTotal, discoveryReview] = await Promise.all([
    db.studio.findMany({ where: { status: "SUBMITTED" }, orderBy: { submittedAt: "asc" }, include: { owner: true, rooms: true, photos: true } }),
    db.studio.count({ where: { status: "VERIFIED" } }),
    db.studio.count({ where: { status: "REJECTED" } }),
    db.studio.count(),
    db.payment.count({ where: { kind: "DEPOSIT", status: "PENDING", booking: { status: "PENDING_DEPOSIT" } } }),
    db.payment.count({ where: { kind: "BALANCE", status: "PENDING", booking: { status: "CONFIRMED" } } }),
    db.payment.count({ where: { kind: "REFUND", status: "PENDING" } }),
    db.flashSlot.count({ where: { status: "ACTIVE", expiresAt: { gt: new Date() } } }),
    db.candidateStudio.count(),
    db.candidateStudio.count({ where: { status: "REVIEW_REQUIRED" } }),
  ]);

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-5 py-12">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-acid">Marketplace control</span>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">36 Admin</h1>
        <div className="flex flex-wrap items-end justify-between gap-4"><p className="mt-3 text-sm text-zinc-500">Verification is the supply quality gate before listings reach creator search.</p><div className="flex gap-2"><Link href="/admin/discovery" className="rounded-full border border-acid/30 px-4 py-2 text-xs font-bold text-acid">Discovery{discoveryReview > 0 ? ` · ${discoveryReview}` : ""}</Link><Link href="/admin/analytics" className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-bold">Analytics</Link><Link href="/admin/payouts" className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-bold">Payouts</Link><Link href="/admin/payments" className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-bold">Payments</Link><Link href="/admin/disputes" className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-bold">Disputes</Link><Link href="/admin/promos" className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-bold">Promos</Link><Link href="/admin/test-marketplace" className="rounded-full border border-emerald-900/50 px-4 py-2 text-xs font-bold text-emerald-300">Test marketplace</Link></div></div>

        <div className="mt-8 grid gap-4 sm:grid-cols-4 xl:grid-cols-8">
          {[['Pending review', submitted.length], ['Verified', verified], ['Changes required', rejected], ['All studios', totals], ['Deposits pending', pendingDeposits], ['Balances pending', pendingBalances], ['Refunds pending', pendingRefunds], ['36 NOW live', liveNow]].map(([label, value]) => <div key={String(label)} className="panel"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">{label}</span><b className="mt-3 block text-3xl font-black">{value}</b>{(label === 'Deposits pending' || label === 'Balances pending' || label === 'Refunds pending') && <Link href="/admin/payments" className="mt-3 inline-flex text-[10px] font-black text-acid">Open queue →</Link>}</div>)}
        </div>

        <Link href="/admin/discovery" className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-acid/15 bg-acid/[0.025] p-6 transition hover:border-acid/30"><div><span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">Discovery supply</span><h2 className="mt-2 text-2xl font-black">External candidate workspace</h2><p className="mt-2 text-sm text-zinc-500">Inspect source evidence and resolve candidate lifecycle states before any listing can enter 36 onboarding.</p></div><div className="text-right"><b className="text-3xl font-black">{discoveryTotal}</b><span className="block text-xs text-zinc-600">{discoveryReview} need review</span></div></Link>

        <section className="mt-8 panel">
          <div className="flex items-center justify-between"><div><span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">Verification queue</span><h2 className="mt-2 text-2xl font-black">Submitted studios</h2></div><b className="text-sm text-zinc-600">{submitted.length} waiting</b></div>
          {submitted.length === 0 ? <div className="mt-6 rounded-xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-600">No studios are waiting for verification.</div> : <div className="mt-6 divide-y divide-zinc-900">{submitted.map((studio) => <Link key={studio.id} href={`/admin/studios/${studio.id}`} className="flex flex-wrap items-center justify-between gap-4 py-5 first:pt-0 last:pb-0 group"><div className="flex items-center gap-4"><div className="grid h-12 w-12 place-items-center rounded-xl bg-acid font-black text-black">36</div><div><div className="flex items-center gap-2"><h3 className="font-black group-hover:text-acid">{studio.name}</h3><StudioStatusBadge status={studio.status} /></div><p className="mt-1 text-xs text-zinc-600">{studio.owner.name} · {studio.owner.email} · {categoryLabel(studio.primaryCategory)} · {studio.city}</p></div></div><div className="text-right text-xs text-zinc-500"><b className="block text-zinc-200">{studio.rooms.length} rooms · {studio.photos.length} photos</b><span>{studio.submittedAt ? new Intl.DateTimeFormat('en', { dateStyle: 'medium' }).format(studio.submittedAt) : 'Submitted'}</span></div></Link>)}</div>}
        </section>
      </section>
    </main>
  );
}
