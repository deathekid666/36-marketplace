import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";

export default async function Page() {
  const user = await requireRole("CREATOR");

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-5 py-12">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-acid">
          Find a place to create
        </span>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              Creator dashboard
            </h1>
            <p className="mt-3 text-sm text-zinc-500">Signed in as {user.name} · {user.role}</p>
          </div>
          <div className="rounded-full border border-zinc-800 px-4 py-2 text-xs text-zinc-500">
            Marketplace M5
          </div>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <article className="panel"><h2 className="text-lg font-black">Search studios</h2><p className="mt-2 text-sm leading-6 text-zinc-500">Search verified rooms by exact date, time, category and budget.</p><Link href="/studios" className="mt-5 inline-flex text-xs font-black text-acid">Find availability →</Link></article>
          <article className="panel"><h2 className="text-lg font-black">⚡ 36 NOW</h2><p className="mt-2 text-sm leading-6 text-zinc-500">Book last-minute empty studio inventory at temporary lower rates.</p><Link href="/now" className="mt-5 inline-flex text-xs font-black text-acid">See NOW slots →</Link></article>
          <article className="panel"><h2 className="text-lg font-black">Favorites</h2><p className="mt-2 text-sm leading-6 text-zinc-500">Save studios and compare your shortlist later.</p><Link href="/creator/favorites" className="mt-5 inline-flex text-xs font-black text-acid">Open favorites →</Link></article>
          <article className="panel"><h2 className="text-lg font-black">My bookings</h2><p className="mt-2 text-sm leading-6 text-zinc-500">Payments, private studio chat, cancellations, refunds and verified reviews.</p><Link href="/creator/bookings" className="mt-5 inline-flex text-xs font-black text-acid">Open bookings →</Link></article>
          <article className="panel"><h2 className="text-lg font-black">36 Request</h2><p className="mt-2 text-sm leading-6 text-zinc-500">Post what you need and receive offers from compatible verified studios.</p><Link href="/creator/requests" className="mt-5 inline-flex text-xs font-black text-acid">Create a request →</Link></article>
        </div>
      </section>
    </main>
  );
}
