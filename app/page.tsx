import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { getCurrentUser } from "@/lib/auth";

const categories = [
  ["Recording", "Vocals, production, mixing rooms"],
  ["Podcast", "Ready-to-record podcast spaces"],
  ["Photo", "Photography studios and sets"],
  ["Video", "Cyclorama, content and production spaces"],
];

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />

      <section className="mx-auto max-w-7xl px-5 pb-24 pt-20 sm:pt-28">
        <div className="max-w-4xl">
          <div className="mb-5 inline-flex rounded-full border border-acid/20 bg-acid/[0.05] px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-acid">
            Casablanca first · Morocco next
          </div>
          <h1 className="text-5xl font-black leading-[0.9] tracking-[-0.06em] sm:text-7xl md:text-8xl">
            Book a space
            <br />
            <span className="text-zinc-600">to create.</span>
          </h1>
          <p className="mt-7 max-w-2xl text-base leading-7 text-zinc-400 sm:text-lg">
            36 is a marketplace for independent creative studios. Compare spaces,
            availability and prices in one place, then book with confidence.
          </p>

          <form action="/studios" method="GET" className="mt-9 grid max-w-3xl gap-3 rounded-2xl border border-zinc-900 bg-zinc-950/80 p-3 sm:grid-cols-[1fr_1fr_auto]">
            <select name="category" className="field"><option value="">What are you creating?</option><option value="RECORDING">Recording</option><option value="PODCAST">Podcast</option><option value="PHOTO">Photo</option><option value="VIDEO">Video</option><option value="REHEARSAL">Rehearsal</option><option value="DJ">DJ</option><option value="PRODUCTION">Production</option></select>
            <input name="city" className="field" defaultValue="Casablanca" aria-label="City or neighborhood" />
            <button className="rounded-xl bg-acid px-6 py-3 text-sm font-black text-black">Find studios</button>
          </form>

          <div className="mt-5 flex flex-wrap gap-3">
            {user ? (
              <Link
                href="/dashboard"
                className="rounded-full bg-acid px-6 py-3 text-sm font-black text-black"
              >
                Open dashboard
              </Link>
            ) : (
              <>
                <Link
                  href="/studios"
                  className="rounded-full bg-acid px-6 py-3 text-sm font-black text-black"
                >
                  Find a studio
                </Link>
                <Link
                  href="/auth/signup"
                  className="rounded-full border border-zinc-700 px-6 py-3 text-sm font-bold text-white"
                >
                  List your studio
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="mt-20 grid gap-4 md:grid-cols-4">
          {categories.map(([title, text]) => (
            <article key={title} className="panel min-h-40">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-acid">
                {title}
              </span>
              <p className="mt-10 text-sm leading-6 text-zinc-500">{text}</p>
            </article>
          ))}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <article className="panel md:col-span-2">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-600">Two ways to book</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2"><div><h2 className="text-2xl font-black tracking-[-0.04em]">36 Request</h2><p className="mt-3 text-sm leading-6 text-zinc-500">Post your time, budget and requirements. Compatible verified studios can send offers.</p>{user?.role === "CREATOR" && <Link href="/creator/requests" className="mt-4 inline-flex text-xs font-black text-acid">Post a request →</Link>}</div><div><h2 className="text-2xl font-black tracking-[-0.04em]">⚡ 36 NOW</h2><p className="mt-3 text-sm leading-6 text-zinc-500">Book last-minute empty studio time at temporary lower rates.</p><Link href="/now" className="mt-4 inline-flex text-xs font-black text-acid">See live slots →</Link></div></div>
          </article>
          <article className="panel">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-zinc-600">Marketplace status</p>
            <div className="mt-7 text-4xl font-black text-acid">M4</div>
            <p className="mt-2 text-sm text-zinc-500">Exact-time search, 36 NOW, booking chat, verified reviews, cancellation/refunds and payment-gateway boundary.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
