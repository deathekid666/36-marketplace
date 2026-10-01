import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "List your studio" };

export default async function ListYourStudioPage() {
  const user = await getCurrentUser();

  if (user?.role === "STUDIO_OWNER") {
    redirect("/owner/studios/new");
  }

  if (user?.role === "ADMIN") {
    redirect("/admin");
  }

  return (
    <main className="min-h-screen bg-[#f7f7f7] text-[#222]">
      <AppHeader user={user} />
      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-10 lg:grid-cols-[1.05fr_.95fr] lg:py-16">
        <div className="flex min-h-[560px] flex-col justify-between rounded-[32px] bg-[#171717] p-7 text-white sm:p-10">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-acid">Become a 36 host</span>
            <h1 className="mt-5 max-w-2xl text-5xl font-black tracking-[-0.055em] sm:text-6xl">Put your studio on the map.</h1>
            <p className="mt-5 max-w-xl text-sm leading-7 text-[#b7b7b7]">
              Build a bookable studio page, set rooms and prices, control availability, receive bookings and manage creator conversations from one owner workspace.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["01", "Create", "Studio identity, rooms and equipment."],
              ["02", "Verify", "Submit the listing for marketplace review."],
              ["03", "Operate", "Bookings, availability, revenue and analytics."],
            ].map(([step, title, text]) => (
              <div key={step} className="rounded-2xl border border-white/10 bg-white/[.04] p-4">
                <span className="text-[10px] font-black text-acid">{step}</span>
                <b className="mt-3 block">{title}</b>
                <p className="mt-1 text-xs leading-5 text-[#8d8d8d]">{text}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[32px] border border-[#e2e2e2] bg-white p-7 sm:p-10">
          {user?.role === "CREATOR" ? (
            <>
              <span className="text-xs font-black uppercase tracking-[0.18em] text-acid">Studio-owner workspace</span>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em]">Listing a studio is separate from your Creator dashboard.</h2>
              <p className="mt-3 text-sm leading-7 text-[#717171]">
                Your current account is a Creator account. The current 36 account model keeps studio-owner management separate so bookings and owner operations do not land on the same dashboard.
              </p>
              <div className="mt-7 rounded-2xl bg-[#f7f7f7] p-5">
                <b className="text-sm">For now</b>
                <p className="mt-2 text-xs leading-6 text-[#717171]">
                  Use a Studio Owner account to create or claim a studio. We will later merge Creator + Owner capabilities into one Airbnb-style account without mixing the two dashboards.
                </p>
              </div>
              <Link href="/profile" className="mt-7 flex w-full items-center justify-between rounded-2xl border border-[#d8d8d8] px-5 py-4 text-sm font-black">
                Back to my account <span>→</span>
              </Link>
            </>
          ) : (
            <>
              <span className="text-xs font-black uppercase tracking-[0.18em] text-acid">Start listing</span>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.04em]">Create a studio-owner account.</h2>
              <p className="mt-3 text-sm leading-7 text-[#717171]">
                Studio owners get a separate business dashboard for listings, bookings, availability, revenue and analytics.
              </p>
              <Link href="/auth/signup?role=STUDIO_OWNER" className="mt-7 flex w-full items-center justify-between rounded-2xl bg-[#222] px-5 py-4 text-sm font-black text-white">
                Create studio-owner account <span>→</span>
              </Link>
              <Link href="/auth/login" className="mt-3 flex w-full items-center justify-between rounded-2xl border border-[#d8d8d8] px-5 py-4 text-sm font-black">
                I already have an owner account <span>→</span>
              </Link>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
