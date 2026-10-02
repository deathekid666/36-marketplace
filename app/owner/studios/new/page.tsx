import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { StudioOnboardingWizard } from "@/components/StudioOnboardingWizard";
import { requireVerifiedRole } from "@/lib/auth";
import { STUDIO_CATEGORIES } from "@/lib/studio";

export default async function NewStudioPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const user = await requireVerifiedRole("STUDIO_OWNER");
  const query = await searchParams;

  return (
    <main className="min-h-screen bg-[#f7f7f7] text-[#222]">
      <AppHeader user={user} />

      <section className="mx-auto max-w-7xl px-5 py-9 sm:py-12">
        <div className="mb-8">
          <Link
            href="/owner/studios"
            className="text-xs font-bold text-[#717171] hover:text-[#222]"
          >
            ← My studios
          </Link>

          <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-xs font-black uppercase tracking-[0.18em] text-acid">
                List a studio
              </span>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] sm:text-5xl">
                Build your 36 listing.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#717171]">
                A guided setup for the studio identity, exact location, first room,
                amenities, availability and booking policies.
              </p>
            </div>

            <div className="rounded-full border border-[#dddddd] bg-white px-4 py-2 text-[10px] font-black text-[#717171]">
              Draft only · nothing goes public until verified
            </div>
          </div>
        </div>

        {query.error === "incomplete" && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Some required listing details were missing. Please review the steps and choose an exact address suggestion before creating the draft.
          </div>
        )}

        <StudioOnboardingWizard
          categories={STUDIO_CATEGORIES.map((category) => ({
            value: category.value,
            label: category.label,
          }))}
        />
      </section>
    </main>
  );
}
