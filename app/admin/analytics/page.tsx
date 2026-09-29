import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMad } from "@/lib/finance";

export default async function AdminAnalyticsPage(){
  const user=await requireRole("ADMIN");
  const since=new Date(Date.now()-30*86400000);
  const [users,studios,verified,bookings,requests,offers,events,payouts]=await Promise.all([
    db.user.count(),db.studio.count(),db.studio.count({where:{status:"VERIFIED"}}),
    db.booking.findMany({where:{createdAt:{gte:since}},select:{status:true,totalAmountMad:true,commissionAmountMad:true,createdAt:true}}),
    db.studioRequest.count({where:{createdAt:{gte:since}}}),db.requestOffer.count({where:{createdAt:{gte:since}}}),
    db.marketplaceEvent.groupBy({by:["eventType"],where:{createdAt:{gte:since}},_count:{_all:true}}),
    db.payout.aggregate({_sum:{netAmountMad:true,commissionAmountMad:true},where:{createdAt:{gte:since}}}),
  ]);
  const gmv=bookings.filter(b=>["CONFIRMED","COMPLETED"].includes(b.status)).reduce((s,b)=>s+b.totalAmountMad,0);
  const commission=bookings.filter(b=>["CONFIRMED","COMPLETED"].includes(b.status)).reduce((s,b)=>s+b.commissionAmountMad,0);
  const cancelled=bookings.filter(b=>b.status==="CANCELLED").length;
  const confirmed=bookings.filter(b=>["CONFIRMED","COMPLETED"].includes(b.status)).length;
  return <main className="min-h-screen"><AppHeader user={user}/><section className="mx-auto max-w-7xl px-5 py-12"><div className="flex flex-wrap items-end justify-between gap-4"><div><Link href="/admin" className="text-xs font-bold text-zinc-500">← Admin</Link><span className="mt-6 block text-xs font-bold uppercase tracking-[0.2em] text-acid">Last 30 days</span><h1 className="mt-2 text-4xl font-black">Marketplace analytics</h1></div><Link href="/admin/payouts" className="rounded-full border border-zinc-700 px-4 py-2 text-xs font-bold">Payouts</Link></div><div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[["Users",users],["Verified studios",verified],["Bookings created",bookings.length],["Confirmed/completed",confirmed],["GMV",formatMad(gmv)],["36 commission",formatMad(commission)],["36 Requests",requests],["Offers sent",offers]].map(([l,v])=><div className="panel" key={String(l)}><span className="label">{l}</span><b className="mt-3 block text-2xl">{v}</b></div>)}</div><div className="mt-8 grid gap-6 lg:grid-cols-2"><section className="panel"><h2 className="text-xl font-black">Funnel events</h2><div className="mt-5 space-y-3">{events.length===0?<p className="text-sm text-zinc-600">No tracked events yet.</p>:events.sort((a,b)=>b._count._all-a._count._all).map(e=><div className="flex justify-between border-b border-zinc-900 pb-3" key={e.eventType}><span className="text-sm text-zinc-400">{e.eventType.replaceAll("_"," ")}</span><b>{e._count._all}</b></div>)}</div></section><section className="panel"><h2 className="text-xl font-black">Marketplace health</h2><dl className="mt-5 space-y-4 text-sm"><div className="flex justify-between"><dt className="text-zinc-500">All studios</dt><dd className="font-bold">{studios}</dd></div><div className="flex justify-between"><dt className="text-zinc-500">Verification rate</dt><dd className="font-bold">{studios?Math.round(verified/studios*100):0}%</dd></div><div className="flex justify-between"><dt className="text-zinc-500">Cancellation rate</dt><dd className="font-bold">{bookings.length?Math.round(cancelled/bookings.length*100):0}%</dd></div><div className="flex justify-between"><dt className="text-zinc-500">Net studio value tracked</dt><dd className="font-bold text-acid">{formatMad(payouts._sum.netAmountMad||0)}</dd></div></dl></section></div></section></main>;
}
