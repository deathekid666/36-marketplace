import { AppHeader } from "@/components/AppHeader";
import { acceptOfferAction, createStudioRequestAction } from "@/app/creator/actions";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { categoryLabel, STUDIO_CATEGORIES } from "@/lib/studio";
import { formatMarketplaceDateTime } from "@/lib/time";

export default async function CreatorRequestsPage({ searchParams }: { searchParams: Promise<{ created?: string; error?: string }> }) {
  const user = await requireRole("CREATOR");
  const query = await searchParams;
  const requests = await db.studioRequest.findMany({
    where: { creatorId: user.id },
    orderBy: { createdAt: "desc" },
    include: { offers: { include: { studio: true, room: true }, orderBy: { totalAmountMad: "asc" } } },
  });

  return <main className="min-h-screen"><AppHeader user={user} /><section className="mx-auto max-w-7xl px-5 py-12">
    <span className="text-xs font-bold uppercase tracking-[0.18em] text-acid">Reverse marketplace</span><h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">36 Request</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">Tell studios what you need. Verified studios can answer with a room, time and price.</p>
    {query.created && <div className="mt-6 rounded-xl border border-acid/30 bg-acid/[0.04] p-4 text-sm text-acid">Request published to compatible studios.</div>}
    {query.error && <div className="mt-6 rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">That action could not be completed. The offer may have expired or the slot may no longer be available.</div>}
    <div className="mt-8 grid gap-6 xl:grid-cols-[420px_1fr]">
      <section className="panel self-start"><h2 className="text-2xl font-black">What do you need?</h2><form action={createStudioRequestAction} className="mt-6 space-y-4">
        <label><span className="label">Type of space</span><select className="field" name="category">{STUDIO_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3"><label><span className="label">City</span><input className="field" name="city" defaultValue="Casablanca" required /></label><label><span className="label">Neighborhood</span><input className="field" name="neighborhood" placeholder="Optional" /></label></div>
        <label><span className="label">When</span><input className="field" type="datetime-local" name="desiredStartAt" required /></label>
        <div className="grid grid-cols-2 gap-3"><label><span className="label">Duration</span><select className="field" name="durationHours" defaultValue="2">{[1,2,3,4,5,6,8].map((h) => <option key={h} value={h}>{h} hour{h === 1 ? "" : "s"}</option>)}</select></label><label><span className="label">Max budget MAD</span><input className="field" type="number" min="50" name="budgetMad" defaultValue="500" required /></label></div>
        <label className="flex items-center gap-3 text-sm text-zinc-400"><input type="checkbox" name="engineerRequired" className="accent-[#d9ff43]" /> Engineer required</label>
        <label><span className="label">Details</span><textarea className="field min-h-28" name="details" placeholder="Example: vocal recording, Auto-Tune monitoring, condenser mic…" /></label>
        <button className="w-full rounded-xl bg-acid px-5 py-3.5 text-sm font-black text-black">Publish request</button>
      </form></section>
      <section className="space-y-4">{requests.length === 0 ? <div className="panel text-center text-sm text-zinc-600">Your requests will appear here.</div> : requests.map((request) => <article key={request.id} className="panel"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-acid">{categoryLabel(request.category)} · {request.status.replaceAll("_", " ")}</span><h2 className="mt-2 text-xl font-black">{request.city}{request.neighborhood ? ` · ${request.neighborhood}` : ""}</h2><p className="mt-1 text-xs text-zinc-500">{formatMarketplaceDateTime(request.desiredStartAt)} · {request.durationMinutes/60}h · budget ≤ {request.budgetMad} MAD{request.engineerRequired ? " · engineer required" : ""}</p></div><b className="text-sm text-zinc-500">{request.offers.length} offer{request.offers.length === 1 ? "" : "s"}</b></div>{request.details && <p className="mt-4 text-sm leading-6 text-zinc-500">{request.details}</p>}
        <div className="mt-5 space-y-3">{request.offers.map((offer) => <div key={offer.id} className={`rounded-xl border p-4 ${offer.status === "ACCEPTED" ? "border-acid/40 bg-acid/[0.03]" : "border-zinc-900 bg-black/25"}`}><div className="flex flex-wrap items-start justify-between gap-4"><div><b>{offer.studio.name}</b><span className="mt-1 block text-xs text-zinc-500">{offer.room.name} · {formatMarketplaceDateTime(offer.offeredStartAt)} · {offer.durationMinutes/60}h</span></div><div className="text-right"><b className="text-lg">{offer.totalAmountMad} MAD</b><span className={`block text-[10px] ${offer.totalAmountMad <= request.budgetMad ? "text-acid" : "text-amber-400"}`}>{offer.totalAmountMad <= request.budgetMad ? "within budget" : "over budget"}</span></div></div>{offer.message && <p className="mt-3 text-xs leading-5 text-zinc-500">{offer.message}</p>}{request.status === "OPEN" && offer.status === "ACTIVE" && offer.expiresAt > new Date() && <form action={acceptOfferAction} className="mt-4"><input type="hidden" name="offerId" value={offer.id} /><button className="rounded-lg bg-acid px-4 py-2 text-xs font-black text-black">Accept & reserve</button></form>}</div>)}</div>
      </article>)}</section>
    </div>
  </section></main>;
}
