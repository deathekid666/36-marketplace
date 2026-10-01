import Link from "next/link";

import {
  removeDemoMarketplaceAction,
} from "@/app/admin/test-marketplace/actions";
import { AppHeader } from "@/components/AppHeader";
import { DemoMarketplaceSetup } from "@/components/DemoMarketplaceSetup";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function AdminTestMarketplacePage() {
  const user = await requireRole("ADMIN");
  const demo = await db.studio.findUnique({
    where: { slug: "36-demo-studio" },
    select: {
      id: true,
      name: true,
      status: true,
      _count: {
        select: {
          rooms: true,
          bookings: true,
        },
      },
    },
  });

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-4xl px-5 py-12">
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
        <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500">
          Create a clearly labeled fake studio owner, creator and verified
          studio so the full 36 workflow can be tested without using a real
          business, real payment provider or hard-coded credentials.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="panel">
            <h2 className="text-xl font-black">Create test accounts</h2>
            <p className="mt-2 text-xs leading-5 text-zinc-600">
              Passwords are generated server-side and returned only to the
              authenticated admin who presses the button.
            </p>
            <div className="mt-5">
              <DemoMarketplaceSetup />
            </div>
          </section>

          <aside className="space-y-5">
            <section className="panel">
              <span className="label">Current demo</span>
              {demo ? (
                <>
                  <b className="block text-lg">{demo.name}</b>
                  <p className="mt-2 text-xs text-zinc-600">
                    {demo.status} · {demo._count.rooms} room ·{" "}
                    {demo._count.bookings} booking
                    {demo._count.bookings === 1 ? "" : "s"}
                  </p>
                  <Link
                    href="/studios/36-demo-studio"
                    className="mt-4 inline-flex text-xs font-black text-acid"
                  >
                    Open public listing →
                  </Link>
                </>
              ) : (
                <p className="text-sm text-zinc-600">
                  No demo environment exists yet.
                </p>
              )}
            </section>

            {demo && (
              <form
                action={removeDemoMarketplaceAction}
                className="rounded-2xl border border-red-950 bg-red-950/10 p-5"
              >
                <b className="text-sm text-red-300">
                  Remove demo environment
                </b>
                <p className="mt-2 text-xs leading-5 text-zinc-600">
                  Deletes only the two fixed demo accounts and their
                  cascading demo marketplace data.
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
