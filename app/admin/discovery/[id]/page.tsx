import { CandidateStudioStatus } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  approveCandidateAction,
  archiveCandidateAction,
  markCandidateEnrichedAction,
  rejectCandidateAction,
  requestCandidateReviewAction,
} from "@/app/admin/discovery/actions";
import {
  rejectCandidateClaimAction,
  verifyCandidateClaimAction,
} from "@/app/admin/discovery/claim-actions";
import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  discoveryFreshness,
  discoveryFreshnessClass,
  discoveryFreshnessLabel,
} from "@/lib/discovery/freshness";

export const metadata = { title: "Discovery candidate · 36 Admin" };

const STATUS_LABELS: Record<CandidateStudioStatus, string> = {
  DISCOVERED: "Discovered",
  ENRICHED: "Enriched",
  REVIEW_REQUIRED: "Needs review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  ARCHIVED: "Archived",
  CONVERTED: "Converted",
};

const STATUS_CLASS: Record<CandidateStudioStatus, string> = {
  DISCOVERED: "border-zinc-700 text-zinc-300",
  ENRICHED: "border-sky-900/70 text-sky-300",
  REVIEW_REQUIRED: "border-amber-800/70 text-amber-300",
  APPROVED: "border-acid/30 text-acid",
  REJECTED: "border-red-900/70 text-red-300",
  ARCHIVED: "border-zinc-800 text-zinc-500",
  CONVERTED: "border-emerald-900/70 text-emerald-300",
};

function dateTime(value: Date | null) {
  if (!value) return "—";
  return (
    new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(value) + " UTC"
  );
}

function safeExternalUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

const RESULT_MESSAGES: Record<string, string> = {
  approved: "Candidate approved for the later public discovery surface.",
  rejected: "Candidate rejected.",
  archived: "Candidate archived.",
  "review-required": "Candidate moved to human review.",
  enriched: "Candidate marked enriched.",
  "claim-verified": "Ownership claim verified. The candidate is still not bookable until D9 onboarding/conversion.",
  "claim-rejected": "Ownership claim rejected.",
};

const ERROR_MESSAGES: Record<string, string> = {
  "candidate-not-found": "Candidate no longer exists.",
  "transition-not-allowed": "That lifecycle transition is not allowed from the current status.",
  "admin-invalid": "The admin actor is no longer valid.",
  "category-unresolved": "Resolve the studio category before marking this candidate enriched or approved.",
  "country-unresolved": "Resolve the two-letter country code before marking this candidate enriched or approved.",
  "location-incomplete": "Add a city/address or valid coordinates before marking this candidate enriched or approved.",
  "source-required": "At least one active source is required before this candidate can be enriched or approved.",
  "identity-incomplete": "The candidate name/identity is incomplete.",
  "concurrent-update": "The candidate changed during review. Reload and review the latest state.",
  "transition-failed": "The lifecycle action failed.",
  "claim-already-verified": "Another ownership claim is already verified for this candidate.",
  "claim-candidate-unavailable": "This candidate is no longer available for claim review.",
  "claim-review-not-allowed": "This ownership claim is no longer pending.",
  "claim-not-found": "The ownership claim no longer exists.",
  "claim-review-failed": "The ownership claim review failed.",
};

export default async function AdminDiscoveryCandidatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ result?: string; error?: string }>;
}) {
  const user = await requireRole("ADMIN");
  const { id } = await params;
  const query = await searchParams;

  const candidate = await db.candidateStudio.findUnique({
    where: { id },
    include: {
      sources: {
        orderBy: [{ active: "desc" }, { collectedAt: "desc" }],
      },
      transitions: {
        orderBy: { createdAt: "desc" },
        include: {
          actorUser: {
            select: { id: true, name: true, email: true, role: true, status: true },
          },
        },
      },
      convertedStudio: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          city: true,
        },
      },
      claims: {
        orderBy: { updatedAt: "desc" },
        include: {
          claimant: {
            select: {
              id: true,
              name: true,
              email: true,
              role: true,
              status: true,
              emailVerifiedAt: true,
            },
          },
          reviewedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      },
    },
  });

  if (!candidate) notFound();

  const canApprove =
    candidate.status === CandidateStudioStatus.ENRICHED ||
    candidate.status === CandidateStudioStatus.REVIEW_REQUIRED;
  const canReject =
    candidate.status === CandidateStudioStatus.DISCOVERED ||
    candidate.status === CandidateStudioStatus.ENRICHED ||
    candidate.status === CandidateStudioStatus.REVIEW_REQUIRED;
  const canArchive =
    candidate.status === CandidateStudioStatus.DISCOVERED ||
    candidate.status === CandidateStudioStatus.ENRICHED ||
    candidate.status === CandidateStudioStatus.REVIEW_REQUIRED ||
    candidate.status === CandidateStudioStatus.APPROVED;
  const canRequestReview =
    candidate.status === CandidateStudioStatus.DISCOVERED ||
    candidate.status === CandidateStudioStatus.ENRICHED ||
    candidate.status === CandidateStudioStatus.APPROVED ||
    candidate.status === CandidateStudioStatus.REJECTED ||
    candidate.status === CandidateStudioStatus.ARCHIVED;
  const canMarkEnriched =
    candidate.status === CandidateStudioStatus.DISCOVERED ||
    candidate.status === CandidateStudioStatus.REVIEW_REQUIRED;

  const freshness = discoveryFreshness(candidate.lastCheckedAt);

  const qualityChecks = [
    ["Identity", candidate.name.trim().length >= 2 && candidate.normalizedName.trim().length >= 2],
    ["Resolved category", candidate.category !== "OTHER"],
    ["Country code", Boolean(candidate.countryCode && candidate.countryCode.length === 2)],
    [
      "Location",
      Boolean(
        candidate.city?.trim() ||
          candidate.address?.trim() ||
          (candidate.latitude != null && candidate.longitude != null),
      ),
    ],
    ["Active source", candidate.sources.some((source) => source.active)],
  ] as const;

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-5 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/admin/discovery"
            className="text-xs font-bold text-zinc-500 hover:text-white"
          >
            ← Discovery workspace
          </Link>
          {candidate.status === CandidateStudioStatus.APPROVED && (
            <Link
              href={`/discover/${candidate.slug}`}
              className="rounded-full border border-sky-900/50 px-4 py-2 text-xs font-black text-sky-300 hover:border-sky-700"
            >
              View public listing ↗
            </Link>
          )}
        </div>

        {query.result && RESULT_MESSAGES[query.result] && (
          <div className="mt-6 rounded-xl border border-acid/30 bg-acid/[0.04] p-4 text-sm text-acid">
            {RESULT_MESSAGES[query.result]}
          </div>
        )}
        {query.error && ERROR_MESSAGES[query.error] && (
          <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/20 p-4 text-sm text-red-300">
            {ERROR_MESSAGES[query.error]}
          </div>
        )}

        <div className="mt-7 flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${STATUS_CLASS[candidate.status]}`}
              >
                {STATUS_LABELS[candidate.status]}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">
                {candidate.category.replaceAll("_", " ")}
              </span>
            </div>
            <h1 className="mt-4 break-words text-4xl font-black tracking-[-0.045em]">
              {candidate.name}
            </h1>
            <p className="mt-2 break-all font-mono text-xs text-zinc-700">
              {candidate.id}
            </p>
          </div>
          <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5 text-right text-xs text-zinc-600">
            <span className="block">First seen {dateTime(candidate.firstSeenAt)}</span>
            <span className="mt-1 block">Last seen {dateTime(candidate.lastSeenAt)}</span>
            <span className="mt-1 block">Last checked {dateTime(candidate.lastCheckedAt)}</span>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_370px]">
          <div className="space-y-6">
            <section className="panel">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">
                Normalized candidate
              </span>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ["Normalized name", candidate.normalizedName || "—"],
                  ["Category", candidate.category.replaceAll("_", " ")],
                  ["Country", [candidate.country, candidate.countryCode].filter(Boolean).join(" · ") || "—"],
                  ["Region", candidate.region || "—"],
                  ["City", candidate.city || "—"],
                  ["District", candidate.district || "—"],
                  ["Postal code", candidate.postalCode || "—"],
                  ["Address", candidate.address || "—"],
                  ["Latitude", candidate.latitude?.toString() || "—"],
                  ["Longitude", candidate.longitude?.toString() || "—"],
                  ["Phone", candidate.phone || "—"],
                  ["Email", candidate.email || "—"],
                  ["Website", candidate.website || "—"],
                  ["Instagram", candidate.instagram || "—"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl border border-zinc-900 p-4">
                    <span className="label">{label}</span>
                    <p className="break-words text-sm text-zinc-300">{value}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">
                    Evidence
                  </span>
                  <h2 className="mt-2 text-2xl font-black">Provider sources</h2>
                </div>
                <b className="text-sm text-zinc-600">
                  {candidate.sources.length} source{candidate.sources.length === 1 ? "" : "s"}
                </b>
              </div>

              <div className="mt-5 space-y-3">
                {candidate.sources.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-sm text-red-300">
                    No source evidence is attached.
                  </div>
                ) : (
                  candidate.sources.map((source) => {
                    const sourceUrl = safeExternalUrl(source.sourceUrl);
                    const licenseUrl = safeExternalUrl(source.licenseUrl);

                    return (
                      <article
                        key={source.id}
                        className={`rounded-xl border p-4 ${source.active ? "border-zinc-800" : "border-zinc-900 opacity-60"}`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <b>{source.provider}</b>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${source.active ? "border-acid/20 text-acid" : "border-zinc-800 text-zinc-600"}`}
                              >
                                {source.active ? "active" : "inactive"}
                              </span>
                            </div>
                            <p className="mt-1 break-all font-mono text-[10px] text-zinc-700">
                              {source.sourceKey}
                            </p>
                          </div>
                          <span className="text-[10px] text-zinc-600">
                            {dateTime(source.collectedAt)}
                          </span>
                        </div>

                        <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
                          <div>
                            <span className="label">External ID</span>
                            <p className="break-all text-zinc-400">{source.externalId || "—"}</p>
                          </div>
                          <div>
                            <span className="label">Provider category</span>
                            <p className="text-zinc-400">{source.providerCategory || "—"}</p>
                          </div>
                          <div>
                            <span className="label">Attribution</span>
                            <p className="text-zinc-400">{source.attribution || "—"}</p>
                          </div>
                          <div>
                            <span className="label">Last checked</span>
                            <p className="text-zinc-400">{dateTime(source.lastCheckedAt)}</p>
                          </div>
                        </div>

                        {(sourceUrl || licenseUrl) && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            {sourceUrl && (
                              <a
                                href={sourceUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="button-dark"
                              >
                                Open source ↗
                              </a>
                            )}
                            {licenseUrl && (
                              <a
                                href={licenseUrl}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="button-dark"
                              >
                                License ↗
                              </a>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </div>
            </section>

            <section className="panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-sky-300">
                    Ownership
                  </span>
                  <h2 className="mt-2 text-2xl font-black">Studio claims</h2>
                </div>
                <span className="text-xs text-zinc-600">{candidate.claims.length} claim{candidate.claims.length === 1 ? "" : "s"}</span>
              </div>

              {candidate.claims.length === 0 ? (
                <div className="mt-5 rounded-xl border border-dashed border-zinc-800 p-6 text-sm text-zinc-600">
                  No ownership claims have been submitted.
                </div>
              ) : (
                <div className="mt-5 space-y-4">
                  {candidate.claims.map((claim) => {
                    const proofUrl = safeExternalUrl(claim.proofUrl);

                    return (
                      <article key={claim.id} className="rounded-xl border border-zinc-900 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <b>{claim.claimant.name}</b>
                              <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[9px] font-black uppercase text-zinc-400">
                                {claim.status}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-zinc-600">{claim.claimant.email}</p>
                          </div>
                          <span className="text-[10px] text-zinc-700">{dateTime(claim.submittedAt)}</span>
                        </div>

                        <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                          <div>
                            <span className="label">Relationship</span>
                            <p className="text-zinc-400">{claim.relationship.replaceAll("_", " ")}</p>
                          </div>
                          <div>
                            <span className="label">Business email</span>
                            <p className="break-all text-zinc-400">{claim.businessEmail}</p>
                          </div>
                          <div>
                            <span className="label">Business phone</span>
                            <p className="text-zinc-400">{claim.businessPhone || "—"}</p>
                          </div>
                          <div>
                            <span className="label">Account email verified</span>
                            <p className={claim.claimant.emailVerifiedAt ? "text-emerald-300" : "text-red-300"}>
                              {claim.claimant.emailVerifiedAt ? "Yes" : "No"}
                            </p>
                          </div>
                        </div>

                        {claim.evidenceNote && (
                          <div className="mt-4 rounded-xl border border-zinc-900 p-3">
                            <span className="label">Evidence note</span>
                            <p className="whitespace-pre-wrap text-sm leading-6 text-zinc-400">{claim.evidenceNote}</p>
                          </div>
                        )}

                        {proofUrl && (
                          <a href={proofUrl} target="_blank" rel="noreferrer noopener" className="button-dark mt-4 inline-flex">
                            Open proof link ↗
                          </a>
                        )}

                        {claim.reviewedBy && (
                          <p className="mt-4 text-xs text-zinc-600">
                            Reviewed by {claim.reviewedBy.name || claim.reviewedBy.email} · {dateTime(claim.reviewedAt)}
                          </p>
                        )}
                        {claim.adminNote && (
                          <p className="mt-2 text-xs leading-5 text-zinc-500">Admin note: {claim.adminNote}</p>
                        )}

                        {claim.status === "SUBMITTED" && candidate.status === CandidateStudioStatus.APPROVED && (
                          <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            <form action={verifyCandidateClaimAction}>
                              <input type="hidden" name="claimId" value={claim.id} />
                              <input type="hidden" name="candidateId" value={candidate.id} />
                              <textarea name="adminNote" className="field min-h-20" placeholder="Optional verification note" />
                              <button className="mt-2 w-full rounded-xl bg-emerald-300 px-4 py-3 text-xs font-black text-black">
                                Verify ownership
                              </button>
                            </form>
                            <form action={rejectCandidateClaimAction}>
                              <input type="hidden" name="claimId" value={claim.id} />
                              <input type="hidden" name="candidateId" value={candidate.id} />
                              <textarea name="adminNote" required className="field min-h-20" placeholder="Why is this claim rejected?" />
                              <button className="mt-2 w-full rounded-xl border border-red-900/70 px-4 py-3 text-xs font-black text-red-300">
                                Reject claim
                              </button>
                            </form>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">
                    Audit
                  </span>
                  <h2 className="mt-2 text-2xl font-black">Lifecycle history</h2>
                </div>
                <span className="text-xs text-zinc-600">{candidate.transitions.length} events</span>
              </div>

              <div className="mt-5 space-y-3">
                {candidate.transitions.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-zinc-800 p-6 text-sm text-zinc-600">
                    No lifecycle transitions yet.
                  </div>
                ) : (
                  candidate.transitions.map((transition) => (
                    <article key={transition.id} className="rounded-xl border border-zinc-900 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <b className="text-sm">
                            {transition.fromStatus
                              ? STATUS_LABELS[transition.fromStatus]
                              : "Created"}{" "}
                            → {STATUS_LABELS[transition.toStatus]}
                          </b>
                          <p className="mt-1 font-mono text-[10px] text-zinc-700">
                            {transition.reasonCode}
                          </p>
                        </div>
                        <span className="text-[10px] text-zinc-600">
                          {dateTime(transition.createdAt)}
                        </span>
                      </div>
                      <p className="mt-3 text-xs text-zinc-500">
                        {transition.actor === "ADMIN"
                          ? `Admin · ${transition.actorUser?.name || transition.actorUser?.email || "Unknown admin"}`
                          : "System"}
                      </p>
                      {transition.note && (
                        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-400">
                          {transition.note}
                        </p>
                      )}
                      {transition.metadata != null && (
                        <details className="mt-3 rounded-xl border border-zinc-900 p-3">
                          <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">
                            Evidence metadata
                          </summary>
                          <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words text-[10px] leading-5 text-zinc-500">
                            {JSON.stringify(transition.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-6">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-sky-300">
                Freshness
              </span>
              <div className="mt-3 flex items-center justify-between gap-3">
                <h2 className="text-xl font-black">Provider evidence</h2>
                <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${discoveryFreshnessClass(freshness)}`}>
                  {discoveryFreshnessLabel(freshness)}
                </span>
              </div>
              <p className="mt-3 text-xs leading-5 text-zinc-600">
                Last checked {dateTime(candidate.lastCheckedAt)}. Approved discovery records older than 90 days are hidden from public discovery until a provider refresh sees them again. Converted owner listings are not hidden by provider staleness.
              </p>
            </section>

            <section className="rounded-2xl border border-zinc-900 bg-zinc-950 p-6">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">
                Quality gate
              </span>
              <h2 className="mt-2 text-xl font-black">Approval prerequisites</h2>
              <div className="mt-5 space-y-2">
                {qualityChecks.map(([label, passed]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-xl border border-zinc-900 px-3 py-2.5 text-xs"
                  >
                    <span className="text-zinc-400">{label}</span>
                    <b className={passed ? "text-acid" : "text-red-300"}>
                      {passed ? "✓ Ready" : "Missing"}
                    </b>
                  </div>
                ))}
              </div>
            </section>

            {candidate.convertedStudio && (
              <section className="rounded-2xl border border-emerald-900/40 bg-emerald-950/10 p-6">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
                  Converted
                </span>
                <h2 className="mt-2 text-xl font-black">{candidate.convertedStudio.name}</h2>
                <p className="mt-2 text-xs text-zinc-500">
                  {candidate.convertedStudio.city} · {candidate.convertedStudio.status}
                </p>
                <Link
                  href={`/admin/studios/${candidate.convertedStudio.id}`}
                  className="button-dark mt-4 inline-flex"
                >
                  Open 36 Studio →
                </Link>
              </section>
            )}

            {candidate.status !== CandidateStudioStatus.CONVERTED && (
              <section className="rounded-2xl border border-acid/20 bg-zinc-950 p-6">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">
                  Admin decision
                </span>
                <h2 className="mt-2 text-2xl font-black">Review candidate</h2>
                <p className="mt-3 text-sm leading-6 text-zinc-500">
                  These actions affect discovery state only. They do not make the studio bookable.
                </p>

                {canApprove && (
                  <form action={approveCandidateAction} className="mt-6">
                    <input type="hidden" name="candidateId" value={candidate.id} />
                    <textarea
                      className="field min-h-20"
                      name="note"
                      placeholder="Optional approval note"
                    />
                    <button className="mt-3 w-full rounded-xl bg-acid px-5 py-3.5 text-sm font-black text-black">
                      ✓ Approve candidate
                    </button>
                  </form>
                )}

                {canMarkEnriched && (
                  <form action={markCandidateEnrichedAction} className="mt-4">
                    <input type="hidden" name="candidateId" value={candidate.id} />
                    <input
                      className="field"
                      name="note"
                      placeholder="Why is the normalized record complete?"
                    />
                    <button className="button-dark mt-3 w-full">Mark enriched</button>
                  </form>
                )}

                {canRequestReview && (
                  <form action={requestCandidateReviewAction} className="mt-4">
                    <input type="hidden" name="candidateId" value={candidate.id} />
                    <input
                      className="field"
                      name="note"
                      placeholder="Why does this need human review?"
                    />
                    <button className="button-dark mt-3 w-full">Send to review</button>
                  </form>
                )}

                {canReject && (
                  <form action={rejectCandidateAction} className="mt-4">
                    <input type="hidden" name="candidateId" value={candidate.id} />
                    <textarea
                      className="field min-h-24"
                      name="note"
                      placeholder="Reason: invalid, irrelevant, duplicate noise…"
                      required
                    />
                    <button className="mt-3 w-full rounded-xl border border-red-900/70 px-5 py-3 text-sm font-black text-red-300 hover:bg-red-950/30">
                      Reject candidate
                    </button>
                  </form>
                )}

                {canArchive && (
                  <form action={archiveCandidateAction} className="mt-4">
                    <input type="hidden" name="candidateId" value={candidate.id} />
                    <input
                      className="field"
                      name="note"
                      placeholder="Archive reason, e.g. stale or closed"
                      required
                    />
                    <button className="button-dark mt-3 w-full text-zinc-400">
                      Archive candidate
                    </button>
                  </form>
                )}

                {!canApprove &&
                  !canMarkEnriched &&
                  !canRequestReview &&
                  !canReject &&
                  !canArchive && (
                    <p className="mt-5 rounded-xl border border-zinc-900 p-4 text-xs text-zinc-600">
                      No manual lifecycle action is exposed for this state.
                    </p>
                  )}
              </section>
            )}
          </aside>
        </div>
      </section>
    </main>
  );
}
