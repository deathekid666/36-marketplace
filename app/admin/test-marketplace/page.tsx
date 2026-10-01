import Link from "next/link";

import {
  removeDemoMarketplaceAction,
} from "@/app/admin/test-marketplace/actions";
import { AppHeader } from "@/components/AppHeader";
import { DemoMarketplaceSetup } from "@/components/DemoMarketplaceSetup";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

const DEMO_SLUGS = [
  "36-demo-budget-recording",
  "36-demo-premium-production",
  "36-demo-podcast-content",
];

export default async function AdminTestMarketplacePage() {
  const user = await requireRole("ADMIN");

  const demos = await db.studio.findMany({
    where: { slug: { in: DEMO_SLUGS } },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      _count: {
        select: {
          rooms: true,
          bookings: true,
        },
      },
    },
  });

  const compareUrl =
    demos.length >= 2
      ? "/studios/compare?ids=" +
        encodeURIComponent(demos.map((studio) => studio.id).join(",")) +
        "&duration=1"
      : null;

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-5xl px-5 py-12">
        <Link
          href="/admin"
          className="text-xs font-bold text-zinc-500 hover:text-white"
        >
          ← Admin
        </Link>

        <span className="mt-8 block text-xs font-bold uppercase tracking-[0.18em] text-acid">
          Controlled production test
        </span>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.045em]">
          Marketplace test environment
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">
          Create a clearly labeled fake Studio Owner, Creator and three
          different verified studios. The fixtures are designed specifically
          to test search filters, map markers, comparison, booking,
          availability, offline payment, completion and reviews without using
          real businesses.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="panel">
            <h2 className="text-xl font-black">Create test accounts + studios</h2>
            <p className="mt-2 text-xs leading-5 text-zinc-600">
              Passwords are generated server-side and returned only to the
              authenticated admin who presses the button. No demo password is
              stored in GitHub.
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-zinc-900 bg-black/20 p-3">
                <b className="text-xs text-acid">Budget Recording</b>
                <p className="mt-1 text-[10px] leading-4 text-zinc-600">
                  120 MAD/h · 2 people · no engineer
                </p>
              </div>
              <div className="rounded-xl border border-zinc-900 bg-black/20 p-3">
                <b className="text-xs text-acid">Premium Production</b>
                <p className="mt-1 text-[10px] leading-4 text-zinc-600">
                  450–600 MAD/h · up to 12 · engineer
                </p>
              </div>
              <div className="rounded-xl border border-zinc-900 bg-black/20 p-3">
                <b className="text-xs text-acid">Podcast & Content</b>
                <p className="mt-1 text-[10px] leading-4 text-zinc-600">
                  220 MAD/h · 5 people · engineer
                </p>
              </div>
            </div>

            <div className="mt-5">
              <DemoMarketplaceSetup />
            </div>
          </section>

          <aside className="space-y-5">
            <section className="panel">
              <div className="flex items-center justify-between gap-3">
                <span className="label">Current demo inventory</span>
                <b className="text-xs text-acid">{demos.length}/3</b>
              </div>

              {demos.length ? (
                <div className="mt-4 space-y-3">
                  {demos.map((demo) => (
                    <div
                      key={demo.id}
                      className="rounded-xl border border-zinc-900 bg-black/20 p-3"
                    >
                      <b className="block text-sm">{demo.name}</b>
                      <p className="mt-1 text-[10px] text-zinc-600">
                        {demo.status} · {demo._count.rooms} room
                        {demo._count.rooms === 1 ? "" : "s"} ·{" "}
                        {demo._count.bookings} booking
                        {demo._count.bookings === 1 ? "" : "s"}
                      </p>
                      <Link
                        href={"/studios/" + demo.slug}
                        className="mt-2 inline-flex text-[10px] font-black text-acid"
                      >
                        Open listing →
                      </Link>
                    </div>
                  ))}

                  {compareUrl && (
                    <Link
                      href={compareUrl}
                      className="inline-flex w-full justify-center rounded-xl border border-acid/30 px-4 py-3 text-xs font-black text-acid"
                    >
                      Compare current demo studios
                    </Link>
                  )}
                </div>
              ) : (
                <p className="mt-3 text-sm text-zinc-600">
                  No 3-studio demo environment exists yet.
                </p>
              )}
            </section>

            <section className="panel">
              <span className="label">Quick QA searches</span>
              <div className="mt-3 space-y-2 text-xs">
                <Link
                  href="/studios?city=Casablanca&maxPrice=150&sort=price_asc"
                  className="block font-black text-zinc-400 hover:text-acid"
                >
                  Budget ≤150 MAD/h →
                </Link>
                <Link
                  href="/studios?city=Casablanca&capacity=8&engineer=1&sort=capacity_desc"
                  className="block font-black text-zinc-400 hover:text-acid"
                >
                  Capacity 8+ with engineer →
                </Link>
                <Link
                  href="/studios?city=Casablanca&equipment=Shure%20SM7B&amenity=Wi-Fi"
                  className="block font-black text-zinc-400 hover:text-acid"
                >
                  Shure SM7B + Wi-Fi →
                </Link>
              </div>
            </section>

            {demos.length > 0 && (
              <form
                action={removeDemoMarketplaceAction}
                className="rounded-2xl border border-red-950 bg-red-950/10 p-5"
              >
                <b className="text-sm text-red-300">
                  Remove demo environment
                </b>
                <p className="mt-2 text-xs leading-5 text-zinc-600">
                  Deletes only the fixed demo Owner/Creator accounts and their
                  cascading demo studios, bookings and related data.
                </p>
                <button className="mt-4 text-xs font-black text-red-300">
                  Delete demo data
                </button>
              </form>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
