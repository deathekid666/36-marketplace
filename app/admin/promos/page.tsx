import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { createPromoAction, togglePromoAction } from "./actions";

export const metadata = { title: "Promo codes" };
export default async function Page() {
  const user = await requireRole("ADMIN");
  const promos = await db.promoCode.findMany({ include: { _count: { select: { redemptions: true } } }, orderBy: { createdAt: "desc" } });
  return <main className="min-h-screen"><AppHeader user={user}/><section className="mx-auto max-w-6xl px-5 py-10"><span className="text-xs font-bold uppercase tracking-[.16em] text-acid">Growth controls</span><h1 className="mt-3 text-4xl font-black">Promo codes</h1>
    <form action={createPromoAction} className="panel mt-7 grid gap-3 md:grid-cols-6"><input className="field" name="code" placeholder="WELCOME36" required/><select className="field" name="discountType"><option value="PERCENT">Percent</option><option value="FIXED_MAD">Fixed MAD</option></select><input className="field" name="amount" type="number" min="1" placeholder="Amount" required/><input className="field" name="minBookingMad" type="number" min="0" placeholder="Min booking"/><input className="field" name="maxUses" type="number" min="1" placeholder="Max uses"/><button className="button-dark">Create</button><input type="hidden" name="perUserLimit" value="1"/></form>
    <div className="mt-6 space-y-3">{promos.map((p)=><article key={p.id} className="panel flex flex-wrap items-center justify-between gap-4"><div><b className="text-xl text-acid">{p.code}</b><span className="ml-3 text-sm text-zinc-400">{p.discountType === "PERCENT" ? `${p.amount}%` : `${p.amount} MAD`} · {p._count.redemptions} uses</span></div><form action={togglePromoAction}><input type="hidden" name="promoId" value={p.id}/><button className="button-dark">{p.active ? "Disable" : "Enable"}</button></form></article>)}</div>
  </section></main>;
}
