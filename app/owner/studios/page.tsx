import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { StudioStatusBadge } from "@/components/StudioStatusBadge";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { categoryLabel, studioCompletion } from "@/lib/studio";

export default async function OwnerStudiosPage() {
  const user = await requireRole("STUDIO_OWNER");
  const [studios, pendingClaims] = await Promise.all([
    db.studio.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
      include: { rooms: true, photos: true, openingHours: true },
    }),
    db.candidateStudioClaim.count({
      where: { claimantId: user.id, status: "SUBMITTED" },
    }),
  ]);

  return (
    <main className="min-h-screen bg-white text-[#222]">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-5 py-10 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <Link href="/owner" className="text-xs font-bold text-[#717171] hover:text-[#222]">← Dashboard</Link>
            <span className="mt-6 block text-xs font-bold uppercase tracking-[0.2em] text-acid">Studio manager</span>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">My studios</h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-[#717171]">
              Manage each listing, its rooms, photos, pricing, operating hours and verification status.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/owner/claims" className="rounded-full border border-sky-200 px-5 py-3 text-xs font-black text-sky-600">
              Claims{pendingClaims > 0 ? ` · ${pendingClaims}` : ""}
            </Link>
            <Link href="/owner/studios/new" className="rounded-full bg-[#222] px-5 py-3 text-xs font-black text-white">+ Add studio</Link>
          </div>
        </div>

        {studios.length === 0 ? (
          <div className="mt-10 rounded-3xl border border-dashed border-[#d8d8d8] bg-[#f7f7f7] p-10 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-acid text-xl font-black text-black">36</div>
            <h2 className="mt-5 text-xl font-black">List your first studio</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#717171]">
              Create the listing first. Then add rooms, prices, equipment, photos and availability before submitting it to 36 verification.
            </p>
            <Link href="/owner/studios/new" className="mt-6 inline-flex rounded-full bg-[#222] px-5 py-3 text-sm font-black text-white">Create studio</Link>
          </div>
        ) : (
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {studios.map((studio) => {
              const completion = studioCompletion(studio);
              return (
                <Link key={studio.id} href={`/owner/studios/${studio.id}`} className="group rounded-3xl border border-[#ebebeb] bg-white p-6 transition hover:border-[#cfcfcf] hover:shadow-[0_14px_38px_rgba(0,0,0,.06)]">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <StudioStatusBadge status={studio.status} />
                      <h2 className="mt-4 truncate text-2xl font-black tracking-[-0.03em] group-hover:text-acid">{studio.name}</h2>
                      <p className="mt-1 text-sm text-[#8a8a8a]">{categoryLabel(studio.primaryCategory)} · {studio.neighborhood || studio.city}</p>
                    </div>
                    <strong className="text-2xl font-black text-[#333333]">{completion}%</strong>
                  </div>
                  <div className="mt-6 h-1.5 overflow-hidden rounded-full bg-[#f3f3f3]">
                    <div className="h-full rounded-full bg-acid" style={{ width: `${completion}%` }} />
                  </div>
                  <div className="mt-5 grid grid-cols-3 gap-3 text-xs text-[#717171]">
                    <span><b className="block text-lg text-[#222222]">{studio.rooms.length}</b>rooms</span>
                    <span><b className="block text-lg text-[#222222]">{studio.photos.length}</b>photos</span>
                    <span><b className="block text-lg text-[#222222]">{studio.openingHours.length}</b>days set</span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
