import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatMarketplaceDateTime, localDateKey } from "@/lib/time";

export default async function OwnerBookingsPage() {
  const user = await requireRole("STUDIO_OWNER");
  const bookings = await db.booking.findMany({
    where: { studio: { ownerId: user.id }, startAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    orderBy: { startAt: "asc" },
    include: { creator: true, studio: true, room: true },
  });
  const groups = Map.groupBy(bookings, (b) => localDateKey(b.startAt));

  return <main className="min-h-screen"><AppHeader user={user} /><section className="mx-auto max-w-6xl px-5 py-12"><div className="flex flex-wrap items-end justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[0.18em] text-acid">Owner calendar</span><h1 className="mt-3 text-4xl font-black tracking-[-0.045em]">Bookings</h1><p className="mt-3 text-sm text-zinc-500">Confirmed sessions and active deposit holds across your rooms.</p></div><Link href="/owner/requests" className="rounded-full border border-zinc-700 px-5 py-3 text-sm font-black">Open 36 Requests</Link></div>
    <div className="mt-8 space-y-6">{bookings.length === 0 ? <div className="panel text-center text-sm text-zinc-600">No upcoming bookings yet.</div> : Array.from(groups.entries()).map(([date, dayBookings]) => <section key={date}><h2 className="mb-3 text-sm font-black uppercase tracking-[0.16em] text-zinc-500">{date}</h2><div className="space-y-3">{dayBookings.map((booking) => <article key={booking.id} className="panel"><div className="flex flex-wrap items-start justify-between gap-4"><div><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-acid">{booking.status.replaceAll("_", " ")}</span><h3 className="mt-2 text-xl font-black">{booking.room.name}</h3><p className="mt-1 text-xs text-zinc-500">{booking.studio.name} · {formatMarketplaceDateTime(booking.startAt)} → {formatMarketplaceDateTime(booking.endAt)}</p><p className="mt-2 text-xs text-zinc-600">Creator: {booking.creator.name} · {booking.creator.email}</p></div><div className="text-right"><b className="text-lg">{booking.totalAmountMad} MAD</b><span className="block text-xs text-zinc-600">deposit {booking.paymentStatus}</span><Link href={`/owner/bookings/${booking.id}`} className="mt-3 inline-flex text-xs font-black text-acid">Open →</Link></div></div></article>)}</div></section>)}</div>
  </section></main>;
}
