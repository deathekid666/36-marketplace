import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { toggleFavoriteAction } from "@/app/favorites/actions";
import { CompareStudioButton } from "@/components/CompareStudioButton";
import { CompareTray } from "@/components/CompareTray";

export default async function FavoritesPage() {
  const user = await requireRole("CREATOR");
  const favorites = await db.favorite.findMany({
    where: { userId: user.id, studio: { status: "VERIFIED" } },
    include: { studio: { include: { photos: { orderBy: { sortOrder: "asc" }, take: 1 }, rooms: { where: { active: true }, orderBy: { hourlyRateMad: "asc" }, take: 1 }, reviews: { select: { rating: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  return <main className="min-h-screen"><AppHeader user={user}/><section className="mx-auto max-w-7xl px-5 py-12"><span className="text-xs font-bold uppercase tracking-[0.2em] text-acid">Saved places</span><h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">Favorites</h1><p className="mt-3 text-sm text-zinc-500">Keep a shortlist of studios before choosing a session.</p>{favorites.length === 0 ? <div className="mt-8 rounded-2xl border border-dashed border-zinc-800 p-10 text-center"><p className="text-sm text-zinc-500">No saved studios yet.</p><Link href="/studios" className="mt-5 inline-flex rounded-full bg-acid px-5 py-3 text-xs font-black text-black">Browse studios</Link></div> : <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{favorites.map(({studio}) => { const photo=studio.photos[0]?.url; const rate=studio.rooms[0]?.hourlyRateMad; const avg=studio.reviews.length?studio.reviews.reduce((a,r)=>a+r.rating,0)/studio.reviews.length:null; return <article key={studio.id} className="overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950/70"><Link href={`/studios/${studio.slug}`}><div className="h-48 bg-zinc-900">{photo?<img src={photo} alt={studio.name} className="h-full w-full object-cover"/>:<div className="grid h-full place-items-center text-4xl font-black text-acid">36</div>}</div><div className="p-5"><h2 className="text-xl font-black">{studio.name}</h2><p className="mt-1 text-xs text-zinc-600">{studio.neighborhood || studio.city} {rate?`· from ${rate} MAD/h`:""}</p><p className="mt-2 text-xs text-acid">{avg?`★ ${avg.toFixed(1)}`:"New"}</p></div></Link><div className="flex items-center justify-between gap-3 border-t border-zinc-900 p-4"><form action={toggleFavoriteAction}><input type="hidden" name="studioId" value={studio.id}/><input type="hidden" name="returnTo" value="/creator/favorites"/><button className="text-xs font-bold text-zinc-500 hover:text-red-300">Remove from favorites</button></form><CompareStudioButton studioId={studio.id} studioName={studio.name}/></div></article>})}</div>}<CompareTray date="" durationHours={1}/></section></main>;
}
