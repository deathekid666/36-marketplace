import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMarketplaceDateTime, toMarketplaceDateTimeLocal } from "@/lib/time";
import { cancelFlashSlotAction, createFlashSlotAction } from "@/app/owner/now/actions";

function defaultStart() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  d.setMinutes(0, 0, 0);
  return toMarketplaceDateTimeLocal(d);
}

export default async function OwnerNowPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; error?: string }>;
}) {
  const user = await requireRole("STUDIO_OWNER");
  const query = await searchParams;
  const [rooms, slots] = await Promise.all([
    db.room.findMany({
      where: { active: true, studio: { ownerId: user.id, status: "VERIFIED" } },
      include: { studio: true },
      orderBy: [{ studio: { name: "asc" } }, { name: "asc" }],
    }),
    db.flashSlot.findMany({
      where: { room: { studio: { ownerId: user.id } }, startAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      include: { room: { include: { studio: true } }, booking: true },
      orderBy: { startAt: "asc" },
    }),
  ]);

  const start = defaultStart();
  const end = (() => {
    const d = new Date(Date.now() + 26 * 60 * 60 * 1000);
    d.setMinutes(0, 0, 0);
    return toMarketplaceDateTimeLocal(d);
  })();

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-6xl px-5 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-acid">Last-minute inventory</span>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.045em]">36 NOW</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">Publish verified empty room time at a temporary lower rate. A NOW slot never overrides an existing booking or blocked period.</p>
          </div>
          <Link href="/owner" className="text-xs font-bold text-zinc-500 hover:text-white">← Owner dashboard</Link>
        </div>

        {query.created && <div className="mt-6 rounded-xl border border-acid/30 bg-acid/[0.04] p-4 text-sm text-acid">36 NOW slot published.</div>}
        {query.error && <div className="mt-6 rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">Could not publish that slot. Check rate, duration and availability.</div>}

        <section className="mt-8 panel">
          <h2 className="text-xl font-black">Publish empty time</h2>
          {rooms.length === 0 ? (
            <p className="mt-3 text-sm text-zinc-600">You need at least one active room in a verified studio before publishing 36 NOW inventory.</p>
          ) : (
            <form action={createFlashSlotAction} className="mt-5 grid gap-3 lg:grid-cols-[1.4fr_1fr_1fr_160px_auto]">
              <label><span className="label">Room</span><select className="field" name="roomId">{rooms.map((room) => <option key={room.id} value={room.id}>{room.studio.name} · {room.name} · {room.hourlyRateMad} MAD/h</option>)}</select></label>
              <label><span className="label">Starts</span><input className="field" type="datetime-local" name="startAt" defaultValue={start} required /></label>
              <label><span className="label">Ends</span><input className="field" type="datetime-local" name="endAt" defaultValue={end} required /></label>
              <label><span className="label">Flash MAD/h</span><input className="field" type="number" min="1" name="flashRateMad" placeholder="180" required /></label>
              <button className="self-end rounded-xl bg-acid px-4 py-3.5 text-xs font-black text-black">Publish</button>
            </form>
          )}
        </section>

        <section className="mt-8">
          <h2 className="text-xl font-black">Your NOW inventory</h2>
          <div className="mt-4 space-y-3">
            {slots.length === 0 ? <div className="panel text-sm text-zinc-600">No 36 NOW slots yet.</div> : slots.map((slot) => {
              const effective = slot.status === "ACTIVE" && slot.expiresAt <= new Date() ? "EXPIRED" : slot.status;
              return <article key={slot.id} className="panel"><div className="flex flex-wrap items-center justify-between gap-4"><div><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-acid">{effective}</span><h3 className="mt-2 font-black">{slot.room.studio.name} · {slot.room.name}</h3><p className="mt-1 text-xs text-zinc-500">{formatMarketplaceDateTime(slot.startAt)} → {formatMarketplaceDateTime(slot.endAt)}</p></div><div className="text-right"><b className="text-xl text-acid">{slot.flashRateMad} MAD/h</b><span className="block text-xs text-zinc-600 line-through">{slot.originalRateMad} MAD/h</span></div></div>{effective === "ACTIVE" && <form action={cancelFlashSlotAction} className="mt-4"><input type="hidden" name="flashSlotId" value={slot.id} /><button className="text-xs font-bold text-zinc-500 hover:text-red-300">Cancel NOW slot</button></form>}</article>;
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
