import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMad } from "@/lib/finance";

export default async function OwnerRevenuePage(){
  const user=await requireRole("STUDIO_OWNER");
  const studios=await db.studio.findMany({where:{ownerId:user.id},select:{id:true,name:true}});
  const ids=studios.map(s=>s.id);
  const [bookings,payouts]=await Promise.all([
    db.booking.findMany({where:{studioId:{in:ids}},include:{studio:true,room:true},orderBy:{createdAt:"desc"},take:250}),
    db.payout.findMany({where:{studioId:{in:ids}},orderBy:{createdAt:"desc"},take:250}),
  ]);
  const active=bookings.filter(b=>["CONFIRMED","COMPLETED"].includes(b.status));
  const gross=active.reduce((s,b)=>s+b.totalAmountMad,0);
  const fee=active.reduce((s,b)=>s+b.commissionAmountMad,0);
  const net=active.reduce((s,b)=>s+b.studioNetAmountMad,0);
  const paid=payouts.filter(p=>p.status==="PAID").reduce((s,p)=>s+p.netAmountMad,0);
  const payable=payouts.filter(p=>p.status==="ELIGIBLE").reduce((s,p)=>s+p.netAmountMad,0);
  return <main className="min-h-screen"><AppHeader user={user}/><section className="mx-auto max-w-7xl px-5 py-12"><Link href="/owner" className="text-xs font-bold text-zinc-500">← Studio dashboard</Link><span className="mt-6 block text-xs font-bold uppercase tracking-[0.2em] text-acid">Revenue</span><h1 className="mt-2 text-4xl font-black tracking-[-0.045em]">Money dashboard</h1><p className="mt-3 text-sm text-zinc-500">Gross booking value, 36 commission and payout status across your studios.</p><div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[["Gross",gross],["36 fee",fee],["Studio net",net],["Eligible payout",payable],["Paid out",paid]].map(([l,v])=><div key={String(l)} className="panel"><span className="label">{l}</span><b className="mt-3 block text-2xl">{formatMad(Number(v))}</b></div>)}</div><section className="mt-8 panel"><h2 className="text-2xl font-black">Recent bookings</h2><div className="mt-5 divide-y divide-zinc-900">{bookings.length===0?<p className="text-sm text-zinc-600">No bookings yet.</p>:bookings.slice(0,30).map(b=><Link key={b.id} href={`/owner/bookings/${b.id}`} className="grid gap-3 py-4 first:pt-0 sm:grid-cols-[1.3fr_1fr_auto_auto]"><div><b>{b.studio.name}</b><span className="block text-xs text-zinc-600">{b.room.name}</span></div><span className="text-xs text-zinc-500">{b.status}</span><span className="text-xs">Gross <b>{formatMad(b.totalAmountMad)}</b></span><span className="text-xs text-acid">Net <b>{formatMad(b.studioNetAmountMad)}</b></span></Link>)}</div></section></section></main>;
}
