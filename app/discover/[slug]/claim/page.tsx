import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { submitCandidateClaimAction } from "@/app/discover/[slug]/claim/actions";
import { AppHeader } from "@/components/AppHeader";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = { title: "Claim studio · 36" };

const ERRORS: Record<string, string> = {
  "invalid-form": "Complete the required claim fields.",
  "verify-email": "Verify your account email before submitting an ownership claim.",
  "candidate-not-available": "This discovery listing is no longer available for claiming.",
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
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const user = await getCurrentUser();

  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/discover/${slug}/claim`)}`);

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

  if (!candidate || candidate.status !== "APPROVED") notFound();

  if (user.role !== "STUDIO_OWNER") {
    return (
      <main className="min-h-screen">
        <AppHeader user={user} />
        <section className="mx-auto max-w-2xl px-5 py-16">
          <div className="panel">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-amber-300">
              Studio owner account required
            </span>
            <h1 className="mt-3 text-3xl font-black">Claim {candidate.name}</h1>
            <p className="mt-4 text-sm leading-7 text-zinc-500">
              Ownership claims can only be submitted from a Studio Owner account. Your current account role is {user.role.replaceAll("_", " ").toLowerCase()}.
            </p>
            <Link href={"/discover/" + candidate.slug} className="button-dark mt-6 inline-flex">
              Back to discovery listing
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
            Tell 36 how you are connected to this studio. A claim only verifies ownership; it does not make the studio bookable. Onboarding and listing verification happen afterward.
          </p>
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
              This claim is verified. The next step is 36 studio onboarding; the discovery listing is still not bookable yet.
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
