import Link from "next/link";

import { withdrawCandidateClaimAction } from "@/app/owner/claims/actions";
import { startClaimedStudioOnboardingAction } from "@/app/owner/claims/onboarding-actions";
import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Studio claims · 36" };

const STATUS_STYLE: Record<string, string> = {
  SUBMITTED: "border-sky-900/50 text-sky-300",
  VERIFIED: "border-emerald-900/50 text-emerald-300",
  REJECTED: "border-red-900/50 text-red-300",
  WITHDRAWN: "border-zinc-800 text-zinc-500",
};

export default async function OwnerClaimsPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; error?: string }>;
}) {
  const user = await requireRole("STUDIO_OWNER");
  const query = await searchParams;

  const claims = await db.candidateStudioClaim.findMany({
    where: { claimantId: user.id },
    include: {
      candidateStudio: {
        select: {
          id: true,
          name: true,
          slug: true,
          city: true,
          district: true,
          category: true,
          status: true,
          convertedStudioId: true,
          convertedStudio: {
            select: { id: true, status: true },
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-5xl px-5 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">
              Ownership
            </span>
            <h1 className="mt-3 text-4xl font-black">Your studio claims</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              Track ownership verification for studios 36 discovered before you joined.
            </p>
          </div>
          <Link href="/discover" className="button-dark">
            Find discovered studios
          </Link>
        </div>

        {query.result === "submitted" && (
          <div className="mt-6 rounded-xl border border-sky-900/50 bg-sky-950/10 p-4 text-sm text-sky-300">
            Ownership claim submitted for review.
          </div>
        )}
        {query.result === "withdrawn" && (
          <div className="mt-6 rounded-xl border border-zinc-800 p-4 text-sm text-zinc-400">
            Claim withdrawn.
          </div>
        )}
        {query.error && (
          <div className="mt-6 rounded-xl border border-red-900/50 bg-red-950/10 p-4 text-sm text-red-300">
            {query.error === "market-not-supported"
              ? "This discovery record is outside the currently supported Morocco booking market."
              : query.error === "claim-not-verified"
                ? "Ownership must be verified before onboarding can start."
                : "The claim action could not be completed."}
          </div>
        )}

        {claims.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-zinc-800 p-10 text-center">
            <h2 className="text-xl font-black">No ownership claims yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-zinc-600">
              If 36 has already discovered your studio, open its discovery listing and submit a claim.
            </p>
            <Link href="/discover" className="mt-5 inline-flex rounded-full bg-sky-300 px-5 py-3 text-sm font-black text-black">
              Browse discovery
            </Link>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            {claims.map((claim) => (
              <article key={claim.id} className="rounded-2xl border border-zinc-900 bg-zinc-950/70 p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase ${STATUS_STYLE[claim.status] || "border-zinc-800"}`}>
                      {claim.status.replaceAll("_", " ")}
                    </span>
                    <h2 className="mt-4 text-2xl font-black">{claim.candidateStudio.name}</h2>
                    <p className="mt-1 text-sm text-zinc-600">
                      {[claim.candidateStudio.district, claim.candidateStudio.city].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Link href={"/discover/" + claim.candidateStudio.slug} className="text-xs font-black text-sky-300">
                    Discovery listing →
                  </Link>
                </div>

                <div className="mt-5 grid gap-3 text-xs sm:grid-cols-3">
                  <div className="rounded-xl border border-zinc-900 p-3">
                    <span className="label">Relationship</span>
                    <b>{claim.relationship.replaceAll("_", " ")}</b>
                  </div>
                  <div className="rounded-xl border border-zinc-900 p-3">
                    <span className="label">Business email</span>
                    <b className="break-all">{claim.businessEmail}</b>
                  </div>
                  <div className="rounded-xl border border-zinc-900 p-3">
                    <span className="label">Submitted</span>
                    <b>{claim.submittedAt.toLocaleDateString("en", { timeZone: "UTC" })}</b>
                  </div>
                </div>

                {claim.adminNote && (
                  <div className="mt-4 rounded-xl border border-zinc-900 p-4 text-sm leading-6 text-zinc-400">
                    <b className="block text-xs text-zinc-300">Admin note</b>
                    {claim.adminNote}
                  </div>
                )}

                {claim.status === "SUBMITTED" && (
                  <form action={withdrawCandidateClaimAction} className="mt-4">
                    <input type="hidden" name="claimId" value={claim.id} />
                    <button className="rounded-xl border border-zinc-800 px-4 py-2 text-xs font-black text-zinc-500 hover:text-white">
                      Withdraw claim
                    </button>
                  </form>
                )}

                {claim.status === "VERIFIED" && claim.candidateStudio.convertedStudio ? (
                  <div className="mt-4 rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-4">
                    <b className="text-sm text-emerald-300">Onboarding started</b>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      A private 36 Studio draft now exists. Complete the listing and submit it for marketplace verification.
                    </p>
                    <Link
                      href={`/owner/studios/${claim.candidateStudio.convertedStudio.id}`}
                      className="button-dark mt-3 inline-flex"
                    >
                      Continue studio onboarding →
                    </Link>
                  </div>
                ) : claim.status === "VERIFIED" ? (
                  <div className="mt-4 rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-4">
                    <b className="text-sm text-emerald-300">Ownership verified</b>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      Start a private 36 Studio draft from this verified claim. It will not be bookable until you complete onboarding and pass listing verification.
                    </p>
                    <form action={startClaimedStudioOnboardingAction} className="mt-3">
                      <input type="hidden" name="claimId" value={claim.id} />
                      <button className="rounded-xl bg-acid px-5 py-3 text-xs font-black text-black">
                        Start 36 onboarding
                      </button>
                    </form>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
