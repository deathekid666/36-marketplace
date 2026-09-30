import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { StudioMap } from "@/components/StudioMap";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = {
  title: "Discover studios · 36",
  description: "Explore creative studios discovered by 36. Discovery listings are not yet bookable until the studio joins and is verified.",
};

function labelCategory(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function DiscoverStudiosPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; city?: string }>;
}) {
  const user = await getCurrentUser();
  const query = await searchParams;
  const q = String(query.q || "").trim().slice(0, 120);
  const city = String(query.city || "").trim().slice(0, 120);

  const candidates = await db.candidateStudio.findMany({
    where: {
      status: "APPROVED",
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { normalizedName: { contains: q, mode: "insensitive" } },
              { city: { contains: q, mode: "insensitive" } },
              { district: { contains: q, mode: "insensitive" } },
              { country: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
      ...(city ? { city: { contains: city, mode: "insensitive" } } : {}),
    },
    include: {
      sources: {
        where: { active: true },
        orderBy: { collectedAt: "desc" },
        take: 2,
        select: {
          id: true,
          provider: true,
          attribution: true,
        },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }],
    take: 80,
  });

  const cityRows = await db.candidateStudio.groupBy({
    by: ["city"],
    where: {
      status: "APPROVED",
      city: { not: null },
    },
    _count: { city: true },
    orderBy: { _count: { city: "desc" } },
    take: 30,
  });

  const mapPoints = candidates
    .filter((candidate) => candidate.latitude != null && candidate.longitude != null)
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      lat: Number(candidate.latitude),
      lng: Number(candidate.longitude),
      href: "/discover/" + candidate.slug,
      price: null,
    }));

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />

      <section className="mx-auto max-w-[1500px] px-5 py-10">
        <div className="max-w-3xl">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-sky-300">
            36 Discovery
          </span>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
            Studios we found, before they join 36
          </h1>
          <p className="mt-4 text-sm leading-7 text-zinc-500">
            These are reviewed discovery listings from external place data. They are not bookable on 36 yet.
            A studio only becomes bookable after a real owner completes 36 onboarding and verification.
          </p>
        </div>

        <form
          action="/discover"
          method="GET"
          className="mt-8 grid gap-3 rounded-3xl border border-zinc-800 bg-[#11120f] p-3 md:grid-cols-[1fr_220px_auto]"
        >
          <label className="rounded-2xl px-4 py-2">
            <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
              Search
            </span>
            <input
              name="q"
              defaultValue={q}
              placeholder="Studio name or area"
              className="mt-1 w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-zinc-700"
            />
          </label>
          <label className="rounded-2xl border-t border-zinc-900 px-4 py-2 md:border-l md:border-t-0">
            <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
              City
            </span>
            <select
              name="city"
              defaultValue={city}
              className="mt-1 w-full appearance-none bg-transparent text-sm font-semibold text-white outline-none"
            >
              <option value="" className="bg-zinc-950">All cities</option>
              {cityRows.map((row) => (
                <option key={row.city!} value={row.city!} className="bg-zinc-950">
                  {row.city} · {row._count.city}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-2xl bg-sky-300 px-6 py-3 text-sm font-black text-black">
            Search
          </button>
        </form>

        <div className="mt-7 flex items-center justify-between gap-4">
          <p className="text-sm text-zinc-500">
            <b className="text-zinc-200">{candidates.length}</b> reviewed discovery listing
            {candidates.length === 1 ? "" : "s"}
          </p>
          <Link href="/studios" className="text-xs font-black text-acid">
            Show bookable studios →
          </Link>
        </div>

        {candidates.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-zinc-800 p-14 text-center">
            <h2 className="text-xl font-black">No public discovery listings yet</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-600">
              Candidates stay private until an admin reviews and approves them. This is intentional so raw provider data never appears publicly by accident.
            </p>
          </div>
        ) : (
          <div className={mapPoints.length > 0 ? "mt-7 grid gap-7 xl:grid-cols-[minmax(0,1.05fr)_minmax(460px,.95fr)]" : "mt-7"}>
            <div className={mapPoints.length > 0 ? "grid gap-5 md:grid-cols-2" : "grid gap-5 md:grid-cols-2 xl:grid-cols-3"}>
              {candidates.map((candidate) => (
                <article key={candidate.id} className="rounded-3xl border border-zinc-900 bg-zinc-950/60 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="rounded-full border border-sky-900/50 bg-sky-950/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-sky-300">
                      Discovery
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-zinc-700">
                      {labelCategory(candidate.category)}
                    </span>
                  </div>
                  <h2 className="mt-5 text-xl font-black">{candidate.name}</h2>
                  <p className="mt-2 text-sm text-zinc-500">
                    {[candidate.district, candidate.city, candidate.countryCode].filter(Boolean).join(" · ") || "Location available on listing"}
                  </p>
                  <p className="mt-4 text-xs leading-5 text-zinc-600">
                    Not yet bookable on 36.
                  </p>
                  <div className="mt-5 flex flex-wrap gap-2">
                    {candidate.sources.map((source) => (
                      <span key={source.id} className="rounded-full border border-zinc-800 px-2.5 py-1 text-[10px] text-zinc-500">
                        {source.provider}
                      </span>
                    ))}
                  </div>
                  <Link
                    href={"/discover/" + candidate.slug}
                    className="mt-5 inline-flex text-xs font-black text-sky-300 hover:text-white"
                  >
                    View discovery listing →
                  </Link>
                </article>
              ))}
            </div>

            {mapPoints.length > 0 && (
              <aside className="hidden xl:block">
                <div className="sticky top-5">
                  <div className="mb-3 flex items-center justify-between">
                    <b className="text-sm">Map</b>
                    <span className="text-xs text-zinc-600">{mapPoints.length} locations</span>
                  </div>
                  <StudioMap points={mapPoints} />
                </div>
              </aside>
            )}

            {mapPoints.length > 0 && (
              <div className="xl:hidden">
                <StudioMap points={mapPoints} />
              </div>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
