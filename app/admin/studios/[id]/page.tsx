import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { StudioStatusBadge } from "@/components/StudioStatusBadge";
import { rejectStudioAction, setStudioCommissionAction, verifyStudioAction } from "@/app/admin/actions";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/commerce";
import { categoryLabel, DAYS, studioCompletion } from "@/lib/studio";

export default async function AdminStudioReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ review?: string }>;
}) {
  const user = await requireRole("ADMIN");
  const { id } = await params;
  const query = await searchParams;
  const studio = await db.studio.findUnique({
    where: { id },
    include: {
      owner: true,
      rooms: { include: { equipment: true, blockedSlots: true } },
      photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      amenities: true,
      openingHours: { orderBy: { dayOfWeek: "asc" } },
    },
  });
  if (!studio) notFound();
  const completion = studioCompletion(studio);

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-5 py-10">
        <Link href="/admin" className="text-xs font-bold text-zinc-500 hover:text-white">← Verification queue</Link>
        {query.review === "verified" && <div className="mt-6 rounded-xl border border-acid/30 bg-acid/[0.04] p-4 text-sm text-acid">Studio verified successfully.</div>}
        {query.review === "rejected" && <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/20 p-4 text-sm text-red-300">Changes requested from the owner.</div>}
        <div className="mt-7 flex flex-wrap items-start justify-between gap-5">
          <div><div className="flex items-center gap-3"><StudioStatusBadge status={studio.status} /><span className="text-xs text-zinc-600">{completion}% listing readiness</span></div><h1 className="mt-4 text-4xl font-black tracking-[-0.045em]">{studio.name}</h1><p className="mt-2 text-sm text-zinc-500">{categoryLabel(studio.primaryCategory)} · {studio.neighborhood}, {studio.city}</p></div>
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 text-sm"><span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">Owner</span><b className="mt-2 block">{studio.owner.name}</b><span className="text-zinc-500">{studio.owner.email}</span></div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            <section className="panel"><span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">Listing</span><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-zinc-400">{studio.description || 'No description.'}</p><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-xl border border-zinc-900 p-4"><span className="label">Address</span><p className="text-sm text-zinc-300">{studio.address || 'Missing'}</p></div><div className="rounded-xl border border-zinc-900 p-4"><span className="label">Contact</span><p className="text-sm text-zinc-300">{studio.phone || 'Missing'}</p></div></div></section>

            <section className="panel"><span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">Rooms</span><div className="mt-5 space-y-3">{studio.rooms.map((room) => <article key={room.id} className="rounded-xl border border-zinc-900 p-4"><div className="flex items-start justify-between gap-4"><div><b>{room.name}</b><span className="mt-1 block text-xs text-zinc-600">{categoryLabel(room.category)} · capacity {room.capacity}</span></div><strong>{formatMoney(room.hourlyRateMad, studio.currency)}/h</strong></div><p className="mt-3 text-xs leading-5 text-zinc-500">{room.description || 'No room description.'}</p><div className="mt-3 flex flex-wrap gap-2">{room.equipment.map((e) => <span key={e.id} className="rounded-full border border-zinc-800 px-2.5 py-1 text-[10px] text-zinc-400">{e.name}{e.quantity > 1 ? ` ×${e.quantity}` : ''}</span>)}</div></article>)}{studio.rooms.length === 0 && <p className="text-sm text-red-300">No rooms added.</p>}</div></section>

            <section className="panel"><span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">Photos</span><div className="mt-5 grid gap-3 sm:grid-cols-2">{studio.photos.map((photo) => <figure key={photo.id} className="overflow-hidden rounded-xl border border-zinc-900"><img src={photo.url} alt={photo.alt || studio.name} className="h-48 w-full object-cover" /><figcaption className="p-3 text-xs text-zinc-600">{photo.alt || 'Studio photo'}</figcaption></figure>)}{studio.photos.length === 0 && <p className="text-sm text-red-300">No photos added.</p>}</div></section>

            <section className="panel"><span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">Availability</span><div className="mt-5 grid gap-2 sm:grid-cols-2">{studio.openingHours.map((hour) => <div key={hour.id} className="rounded-xl border border-zinc-900 p-3 text-xs"><b>{DAYS[hour.dayOfWeek]}</b><span className="float-right text-zinc-500">{hour.closed ? 'Closed' : `${hour.opensAt}–${hour.closesAt}`}</span></div>)}</div></section>
          </div>

          <aside className="space-y-6">
            <section className="sticky top-6 rounded-2xl border border-acid/20 bg-zinc-950 p-6">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">Admin decision</span><h2 className="mt-2 text-2xl font-black">Verify supply</h2><p className="mt-3 text-sm leading-6 text-zinc-500">Verify only if the listing is complete enough to represent a real bookable studio. Rejection sends a concrete change request back to the owner.</p>
              <form action={setStudioCommissionAction} className="mt-5 rounded-xl border border-zinc-900 p-4"><input type="hidden" name="studioId" value={studio.id}/><label><span className="label">36 commission %</span><input className="field" name="commissionPercent" type="number" min="0" max="50" step="0.1" defaultValue={(studio.commissionBps/100).toFixed(1)}/></label><button className="button-dark mt-3 w-full">Save commission</button></form>
              <form action={verifyStudioAction} className="mt-6"><input type="hidden" name="studioId" value={studio.id} /><button className="w-full rounded-xl bg-acid px-5 py-3.5 text-sm font-black text-black">✓ Verify studio</button></form>
              <form action={rejectStudioAction} className="mt-5 space-y-3"><input type="hidden" name="studioId" value={studio.id} /><label><span className="label">Request changes</span><textarea className="field min-h-28" name="note" placeholder="What must the owner fix before approval?" /></label><button className="w-full rounded-xl border border-red-900/70 px-5 py-3 text-sm font-black text-red-300 hover:bg-red-950/30">Return for changes</button></form>
              {studio.verificationNote && <div className="mt-5 rounded-xl border border-zinc-900 p-4 text-xs leading-5 text-zinc-500"><b className="block text-zinc-300">Previous note</b>{studio.verificationNote}</div>}
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
