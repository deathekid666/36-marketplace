import { AppHeader } from "@/components/AppHeader";
import { submitRequestOfferAction } from "@/app/owner/request-actions";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/commerce";
import { categoryLabel } from "@/lib/studio";
import {
  formatMarketplaceDateTime,
  studioTimeZone,
  toMarketplaceDateTimeLocal,
} from "@/lib/time";

export default async function OwnerRequestsPage({ searchParams }: { searchParams: Promise<{ offered?: string; error?: string }> }) {
  const user = await requireRole("STUDIO_OWNER");
  const query = await searchParams;
  const studios = await db.studio.findMany({ where: { ownerId: user.id, status: "VERIFIED" }, include: { rooms: { where: { active: true } } } });
  const cities = [...new Set(studios.map((s) => s.city))];
  const requests = cities.length ? await db.studioRequest.findMany({ where: { creatorId: { not: user.id }, status: "OPEN", expiresAt: { gt: new Date() }, OR: cities.map((city) => ({ city: { equals: city, mode: "insensitive" as const } })) }, orderBy: { desiredStartAt: "asc" }, include: { creator: { select: { name: true } }, offers: { where: { studio: { ownerId: user.id } }, include: { studio: true, room: true } } } }) : [];
  const eligibleRooms = studios.flatMap((s) => s.rooms.map((r) => ({ ...r, studio: s })));

  return <main className="min-h-screen"><AppHeader user={user} /><section className="mx-auto max-w-7xl px-5 py-12"><span className="text-xs font-bold uppercase tracking-[0.18em] text-acid">Demand inbox</span><h1 className="mt-3 text-4xl font-black tracking-[-0.045em]">36 Requests</h1><p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">Respond to creator demand using only verified, available inventory.</p>
    {query.offered && <div className="mt-6 rounded-xl border border-acid/30 bg-acid/[0.04] p-4 text-sm text-acid">Offer sent to the creator.</div>}{query.error && <div className="mt-6 rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">Offer rejected: check category, engineer requirement, city and live room availability.</div>}
    {studios.length === 0 ? <div className="mt-8 panel text-center text-sm text-zinc-600">You need at least one verified studio before responding to creator requests.</div> : <div className="mt-8 space-y-4">{requests.length === 0 ? <div className="panel text-center text-sm text-zinc-600">No compatible open requests right now.</div> : requests.map((request) => {
      const rooms = eligibleRooms.filter((r) => r.studio.city.toLowerCase() === request.city.toLowerCase() && r.studio.currency === request.currency && (r.category === request.category || r.studio.primaryCategory === request.category) && (!request.engineerRequired || r.engineerIncluded));
      const existing = request.offers[0];
      const requestTimeZone = rooms[0]
        ? studioTimeZone(rooms[0].studio)
        : undefined;
      return <article key={request.id} className="panel"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-acid">{categoryLabel(request.category)} · {request.city}</span><h2 className="mt-2 text-xl font-black">{request.creator.name} needs a space</h2><p className="mt-1 text-xs text-zinc-500">{formatMarketplaceDateTime(request.desiredStartAt, requestTimeZone)} · {request.durationMinutes/60}h · budget ≤ {formatMoney(request.budgetMad, request.currency)}{request.engineerRequired ? " · engineer required" : ""}</p></div><b className="text-sm text-zinc-500">{existing ? "Offer sent" : "Open"}</b></div>{request.details && <p className="mt-4 text-sm leading-6 text-zinc-500">{request.details}</p>}
        {rooms.length > 0 ? <form action={submitRequestOfferAction} className="mt-5 grid gap-3 md:grid-cols-2"><input type="hidden" name="requestId" value={request.id} /><label><span className="label">Room</span><select className="field" name="roomId" defaultValue={existing?.roomId}>{rooms.map((r) => <option key={r.id} value={r.id}>{r.studio.name} · {r.name} · {formatMoney(r.hourlyRateMad, r.studio.currency)}/h</option>)}</select></label><label><span className="label">Offer time</span><input className="field" type="datetime-local" name="offeredStartAt" defaultValue={toMarketplaceDateTimeLocal(
          existing?.offeredStartAt || request.desiredStartAt,
          studioTimeZone(rooms[0].studio),
        )} required /></label><label><span className="label">Duration</span><select className="field" name="durationHours" defaultValue={request.durationMinutes/60}>{[1,2,3,4,5,6,8].map((h) => <option key={h} value={h}>{h}h</option>)}</select></label><label><span className="label">Total offer · {request.currency}</span><input className="field" type="number" min="1" name="totalAmountMad" defaultValue={existing?.totalAmountMad || Math.min(request.budgetMad, Math.round((rooms[0].hourlyRateMad * request.durationMinutes)/60))} required /></label><label className="md:col-span-2"><span className="label">Message</span><input className="field" name="message" defaultValue={existing?.message} placeholder="Engineer included, mic chain ready, parking available…" /></label><button className="button-dark md:col-span-2">{existing ? "Update offer" : "Send offer"}</button></form> : <p className="mt-4 rounded-xl border border-dashed border-zinc-800 p-4 text-xs text-zinc-600">None of your verified rooms currently match this request.</p>}
      </article>;
    })}</div>}
  </section></main>;
}
