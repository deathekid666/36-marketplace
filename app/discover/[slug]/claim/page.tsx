import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { submitCandidateClaimAction } from "@/app/discover/[slug]/claim/actions";
import { enableHostingAction } from "@/app/list-your-studio/actions";
import { AppHeader } from "@/components/AppHeader";
import { getCurrentUser } from "@/lib/auth";
import { trackMarketplaceEvent } from "@/lib/analytics";
import { db } from "@/lib/db";
import { isDiscoveryRolloutEnabled } from "@/lib/discovery/rollout";

export const metadata = { title: "Claim studio · 36" };

const ERRORS: Record<string, string> = {
  "invalid-form": "Complete the required claim fields.",
  "verify-email": "Verify your account email before submitting an ownership claim.",
  "candidate-not-available": "This discovery listing is no longer available for claiming.",
  "market-not-launched": "Studio claiming is not launched for this market yet.",
  "already-verified": "Ownership for this discovery listing has already been verified.",
  "already-pending": "You already have a claim waiting for review.",
  "business-email-invalid": "Enter a valid business email address.",
  "proof-url-invalid": "The proof URL must be a valid http or https link.",
  "proof-url-unsafe": "Use a normal public website as proof. Local/private-network URLs and URLs containing credentials are not accepted.",
  "claim-rate-limited": "Too many ownership-claim attempts. Try again after the daily limit resets.",
  "evidence-required": "Add a proof link or explain your ownership/management evidence in at least 20 characters.",
  "claim-failed": "The claim could not be submitted.",
};

export default async function ClaimDiscoveryStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string; source?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const user = await getCurrentUser();

  const invited = query.source === "owner-invite";
  const claimPath =
    "/discover/" +
    slug +
    "/claim" +
    (invited ? "?source=owner-invite" : "");

  if (!user) {
    redirect(
      "/auth/login?next=" +
        encodeURIComponent(claimPath),
    );
  }

  const candidate = await db.candidateStudio.findUnique({
    where: { slug },
    include: {
      claims: {
        where: { claimantId: user.id },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
  });

  if (
    !candidate ||
    (candidate.status !== "ENRICHED" && candidate.status !== "APPROVED") ||
    !isDiscoveryRolloutEnabled(candidate, "CLAIMS")
  ) {
    notFound();
  }

  if (invited) {
    await trackMarketplaceEvent({
      eventType: "OWNER_INVITE_LANDING",
      userId: user.id,
      metadata: {
        candidateStudioId: candidate.id,
        candidateSlug: candidate.slug,
      },
    });
  }

  if (user.role === "ADMIN") {
    redirect("/admin");
  }

  if (user.role === "CREATOR") {
    return (
      <main className="min-h-screen">
        <AppHeader user={user} />
        <section className="mx-auto max-w-2xl px-5 py-16">
          <div className="panel">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-acid">
              Use your same 36 account
            </span>
            <h1 className="mt-3 text-3xl font-black">Claim {candidate.name}</h1>
            <p className="mt-4 text-sm leading-7 text-zinc-500">
              You do not need a second Studio Owner account. Enable hosting on this account, then continue directly with the ownership claim.
            </p>
            {!user.emailVerifiedAt ? (
              <>
                <p className="mt-4 text-xs leading-5 text-amber-300">
                  Verify your email first so ownership evidence is tied to a verified account.
                </p>
                <Link href="/auth/verify-email" className="button-dark mt-6 inline-flex">
                  Verify email
                </Link>
              </>
            ) : (
              <form action={enableHostingAction} className="mt-6">
                <input type="hidden" name="nextTo" value={claimPath} />
                <button className="button-dark inline-flex">
                  Enable hosting & continue
                </button>
              </form>
            )}
            <Link href={"/discover/" + candidate.slug} className="mt-4 block text-xs font-bold text-zinc-500">
              ← Back to discovery listing
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const existing = candidate.claims[0];

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-3xl px-5 py-12">
        <Link href={"/discover/" + candidate.slug} className="text-xs font-bold text-zinc-500 hover:text-white">
          ← Back to discovery listing
        </Link>

        <div className="mt-7">
          <span className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">
            Ownership claim
          </span>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.04em]">Claim {candidate.name}</h1>
          <p className="mt-3 text-sm leading-7 text-zinc-500">
            Tell 36 how you are connected to this studio. Claims are available globally for fresh directory records. Verification lets you manage the public directory profile; it does not make the studio bookable.
          </p>
          {invited && (
            <div className="mt-4 rounded-2xl border border-sky-900/40 bg-sky-950/10 p-4 text-xs leading-5 text-sky-200">
              You opened an owner invitation from 36. Claiming is free. Nothing becomes bookable until ownership is verified and you explicitly start booking onboarding in a supported market.
            </div>
          )}
        </div>

        {query.error && ERRORS[query.error] && (
          <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/20 p-4 text-sm text-red-300">
            {ERRORS[query.error]}
          </div>
        )}

        {!user.emailVerifiedAt ? (
          <div className="mt-8 rounded-2xl border border-amber-900/50 bg-amber-950/10 p-6">
            <b className="text-amber-300">Email verification required</b>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Verify {user.email} before submitting a claim.
            </p>
            <Link href="/auth/verify-email" className="button-dark mt-4 inline-flex">
              Verify email
            </Link>
          </div>
        ) : existing?.status === "VERIFIED" ? (
          <div className="mt-8 rounded-2xl border border-emerald-900/50 bg-emerald-950/10 p-6">
            <b className="text-emerald-300">Ownership verified</b>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              This claim is verified. You can now manage the public directory profile. Booking onboarding is a separate optional step and is only available in supported markets.
            </p>
            <Link href="/owner/claims" className="button-dark mt-4 inline-flex">
              View your claims
            </Link>
          </div>
        ) : existing?.status === "SUBMITTED" ? (
          <div className="mt-8 rounded-2xl border border-sky-900/50 bg-sky-950/10 p-6">
            <b className="text-sky-300">Claim submitted</b>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              Your ownership evidence is waiting for admin review.
            </p>
            <Link href="/owner/claims" className="button-dark mt-4 inline-flex">
              Track claim
            </Link>
          </div>
        ) : (
          <form action={submitCandidateClaimAction} className="mt-8 space-y-5 rounded-3xl border border-zinc-800 bg-[#11120f] p-6">
            <input type="hidden" name="candidateStudioId" value={candidate.id} />
            <input type="hidden" name="slug" value={candidate.slug} />

            {existing?.status === "REJECTED" && (
              <div className="rounded-xl border border-red-900/50 bg-red-950/10 p-4 text-sm text-red-300">
                Previous claim was not verified.
                {existing.adminNote ? <span className="mt-2 block text-zinc-400">Admin note: {existing.adminNote}</span> : null}
              </div>
            )}

            <label className="block">
              <span className="label">Your relationship to the studio</span>
              <select name="relationship" required className="field">
                <option value="OWNER">Owner</option>
                <option value="MANAGER">Manager</option>
                <option value="AUTHORIZED_REPRESENTATIVE">Authorized representative</option>
              </select>
            </label>

            <label className="block">
              <span className="label">Business email</span>
              <input
                name="businessEmail"
                type="email"
                required
                defaultValue={existing?.businessEmail || user.email}
                className="field"
                placeholder="studio@example.com"
              />
            </label>

            <label className="block">
              <span className="label">Business phone</span>
              <input
                name="businessPhone"
                defaultValue={existing?.businessPhone || ""}
                className="field"
                placeholder="+212..."
              />
            </label>

            <label className="block">
              <span className="label">Proof link</span>
              <input
                name="proofUrl"
                type="url"
                defaultValue={existing?.proofUrl || candidate.website || ""}
                className="field"
                placeholder="Official website, public business profile, company page…"
              />
              <span className="mt-2 block text-[10px] leading-5 text-zinc-600">
                Use a public page that helps connect you to this business.
              </span>
            </label>

            <label className="block">
              <span className="label">Evidence note</span>
              <textarea
                name="evidenceNote"
                maxLength={2000}
                defaultValue={existing?.evidenceNote || ""}
                className="field min-h-32"
                placeholder="Explain your role and how 36 can verify the claim. Do not enter passwords or private account credentials."
              />
            </label>

            <button className="w-full rounded-xl bg-sky-300 px-5 py-4 text-sm font-black text-black">
              Submit ownership claim
            </button>

            <p className="text-center text-[10px] leading-5 text-zinc-700">
              Never send passwords, login codes or private keys as proof.
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
