import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { FlashBookingButton } from "@/components/FlashBookingButton";
import { getCurrentUser } from "@/lib/auth";
import { validateRoomInterval } from "@/lib/booking";
import { db } from "@/lib/db";
import { formatMoney } from "@/lib/commerce";
import { categoryLabel } from "@/lib/studio";
import {
  formatMarketplaceDateTime,
  studioTimeZone,
} from "@/lib/time";
import { expireStaleBookingHolds } from "@/lib/booking-lifecycle";

export const metadata = { title: "36 NOW" };

export default async function NowPage() {
  const user = await getCurrentUser();

  await expireStaleBookingHolds({ limit: 100 });

  const raw = await db.flashSlot.findMany({
    where: {
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
      startAt: { gt: new Date() },
      room: { active: true, studio: { status: "VERIFIED" } },
    },
    include: {
      room: { include: { studio: { include: { photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], take: 1 } } } } },
    },
    orderBy: { startAt: "asc" },
    take: 60,
  });

  const checks = await Promise.all(raw.map(async (slot) => ({
    slot,
    available: (await validateRoomInterval(db, slot.roomId, slot.startAt, slot.endAt)).ok,
  })));
  const slots = checks.filter((x) => x.available).map((x) => x.slot);

  return (
    <main className="min-h-screen bg-white text-[#222]">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-5 py-12">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-acid">Unsold time · lower price</span>
        <h1 className="mt-3 text-5xl font-black tracking-[-0.055em] sm:text-6xl">36 NOW</h1>
        <p className="mt-4 max-w-2xl text-sm leading-7 text-[#717171]">Verified studios can release empty time at temporary rates. When a creator reserves one, normal booking collision protection still applies.</p>
        <div className="mt-9 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {slots.length === 0 ? <div className="panel md:col-span-2"><h2 className="font-black">No live NOW slots</h2><p className="mt-2 text-sm text-[#8a8a8a]">Studios have not released discounted inventory right now. Browse normal availability instead.</p><Link href="/studios" className="mt-4 inline-flex text-sm font-black text-acid">Browse studios →</Link></div> : slots.map((slot) => {
            const studio = slot.room.studio;
            const photo = studio.photos[0]?.url;
            const hours = (slot.endAt.getTime() - slot.startAt.getTime()) / 3600000;
            const flashTotal = Math.round(slot.flashRateMad * hours);
            const normalTotal = Math.round(slot.originalRateMad * hours);
            const discount = Math.max(0, Math.round((1 - slot.flashRateMad / slot.originalRateMad) * 100));
            return <article key={slot.id} className="overflow-hidden rounded-2xl border border-[#ebebeb] bg-white"><div className="relative h-48 bg-[#f3f3f3]">{photo ? <img src={photo} alt={studio.name} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center text-5xl font-black text-acid">36</div>}<span className="absolute left-4 top-4 rounded-full bg-acid px-3 py-1 text-[10px] font-black text-white">⚡ {discount}% OFF</span></div><div className="p-5"><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-acid">{categoryLabel(slot.room.category)} · {studio.neighborhood || studio.city}</span><h2 className="mt-2 text-xl font-black">{studio.name}</h2><p className="mt-1 text-sm text-[#717171]">{slot.room.name}</p><p className="mt-4 text-xs text-[#555555]">{formatMarketplaceDateTime(slot.startAt, studioTimeZone(studio))} → {formatMarketplaceDateTime(slot.endAt, studioTimeZone(studio))}</p><div className="my-5 flex items-end justify-between"><div><b className="text-2xl text-acid">{formatMoney(flashTotal, slot.currency)}</b><span className="ml-2 text-xs text-[#8a8a8a] line-through">{formatMoney(normalTotal, slot.currency)}</span></div><span className="text-xs text-[#8a8a8a]">{formatMoney(slot.flashRateMad, slot.currency)}/h</span></div><FlashBookingButton
              flashSlotId={slot.id}
              userRole={user?.role ?? null}
              isOwnStudio={Boolean(user && studio.ownerId === user.id)}
            /></div></article>;
          })}
        </div>
      </section>
    </main>
  );
}
