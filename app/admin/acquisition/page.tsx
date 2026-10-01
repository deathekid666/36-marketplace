import { CandidateStudioStatus } from "@prisma/client";
import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { OwnerInviteTools } from "@/components/OwnerInviteTools";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  acquisitionPriorityScore,
  ownerAcquisitionReadiness,
} from "@/lib/discovery/acquisition";
import { parseDirectoryProfileV2 } from "@/lib/discovery/profile-v2";
import { isDiscoveryRolloutEnabled } from "@/lib/discovery/rollout";

export const metadata = {
  title: "Owner acquisition · 36 Admin",
};

function dateLabel(value: Date | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(value);
}

export default async function OwnerAcquisitionPage() {
  const user = await requireRole("ADMIN");
  const since = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000,
  );

  const [
    candidates,
    submittedClaims,
    verifiedClaims,
    convertedCount,
    inviteLandings,
  ] = await Promise.all([
    db.candidateStudio.findMany({
      where: {
        status: {
          in: [
            CandidateStudioStatus.ENRICHED,
            CandidateStudioStatus.APPROVED,
            CandidateStudioStatus.CONVERTED,
          ],
        },
      },
      include: {
        claims: {
          orderBy: { updatedAt: "desc" },
          include: {
            claimant: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
        transitions: {
          where: {
            reasonCode: "VERIFIED_OWNER_PROFILE_UPDATE",
          },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { metadata: true },
        },
        convertedStudio: {
          select: {
            id: true,
            status: true,
            name: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 300,
    }),
    db.candidateStudioClaim.count({
      where: { status: "SUBMITTED" },
    }),
    db.candidateStudioClaim.count({
      where: { status: "VERIFIED" },
    }),
    db.candidateStudio.count({
      where: { status: "CONVERTED" },
    }),
    db.marketplaceEvent.count({
      where: {
        eventType: "OWNER_INVITE_LANDING",
        createdAt: { gte: since },
      },
    }),
  ]);

  const enrichedRows = candidates.map((candidate) => {
    const verifiedClaim = candidate.claims.find(
      (claim) => claim.status === "VERIFIED",
    );
    const pendingClaim = candidate.claims.find(
      (claim) => claim.status === "SUBMITTED",
    );
    const profile = parseDirectoryProfileV2(
      candidate.transitions[0]?.metadata,
    );
    const onboardingAvailable =
      isDiscoveryRolloutEnabled(
        candidate,
        "ONBOARDING",
      );

    const readiness = ownerAcquisitionReadiness({
      claimStatus:
        verifiedClaim?.status ||
        pendingClaim?.status ||
        "NONE",
      candidate,
      profile,
      onboardingAvailable,
      converted: Boolean(
        candidate.convertedStudioId,
      ),
    });

    const priority = acquisitionPriorityScore({
      phone: candidate.phone,
      email: candidate.email,
      website: candidate.website,
      instagram: candidate.instagram,
      onboardingAvailable,
      ownerVerified: Boolean(verifiedClaim),
      claimPending: Boolean(pendingClaim),
    });

    return {
      candidate,
      verifiedClaim,
      pendingClaim,
      profile,
      onboardingAvailable,
      readiness,
      priority,
    };
  });

  const inviteTargets = enrichedRows
    .filter(
      (row) =>
        !row.verifiedClaim &&
        !row.pendingClaim &&
        row.candidate.status !== "CONVERTED" &&
        Boolean(
          row.candidate.phone ||
            row.candidate.email ||
            row.candidate.website ||
            row.candidate.instagram,
        ),
    )
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        b.candidate.updatedAt.getTime() -
          a.candidate.updatedAt.getTime(),
    )
    .slice(0, 40);

  const verifiedOwners = enrichedRows
    .filter((row) => Boolean(row.verifiedClaim))
    .sort(
      (a, b) =>
        b.readiness.percent -
        a.readiness.percent,
    );

  const readyForBooking = verifiedOwners.filter(
    (row) =>
      row.readiness.readyForBookingOnboarding,
  ).length;

  const richProfiles = verifiedOwners.filter(
    (row) => row.readiness.percent >= 75,
  ).length;

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />

      <section className="mx-auto max-w-7xl px-5 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">
              Supply growth
            </span>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              Owner acquisition
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-zinc-500">
              Turn contact-only directory listings into verified owner-managed
              profiles, then into bookable studios in supported markets. No paid
              outreach service is required for this workflow.
            </p>
          </div>

          <Link
            href="/admin/discovery"
            className="button-dark"
          >
            Discovery workspace
          </Link>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {[
            ["Invite landings · 30d", inviteLandings],
            ["Claims waiting", submittedClaims],
            ["Verified owners", verifiedClaims],
            ["Rich profiles", richProfiles],
            ["Ready for booking", readyForBooking],
            ["Converted", convertedCount],
          ].map(([label, value]) => (
            <div key={String(label)} className="panel">
              <span className="label">{label}</span>
              <b className="text-3xl">{value}</b>
            </div>
          ))}
        </div>

        <section className="mt-8 rounded-3xl border border-zinc-900 bg-zinc-950/60 p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-sky-300">
                Outreach queue
              </span>
              <h2 className="mt-2 text-2xl font-black">
                Best owner-invite targets
              </h2>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-600">
                Prioritized by booking-market eligibility and available public
                contact channels. Claiming remains manual and verified.
              </p>
            </div>
            <span className="text-xs text-zinc-600">
              {inviteTargets.length} prioritized
            </span>
          </div>

          {inviteTargets.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-600">
              No unclaimed contactable studios in this sample.
            </div>
          ) : (
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {inviteTargets.map(({ candidate, onboardingAvailable }) => (
                <article
                  key={candidate.id}
                  className="rounded-2xl border border-zinc-900 bg-black/20 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {onboardingAvailable && (
                          <span className="rounded-full border border-acid/25 px-2 py-1 text-[9px] font-black uppercase text-acid">
                            Booking market
                          </span>
                        )}
                        <span className="rounded-full border border-zinc-800 px-2 py-1 text-[9px] font-black uppercase text-zinc-500">
                          {candidate.category.replaceAll("_", " ")}
                        </span>
                      </div>
                      <h3 className="mt-3 text-lg font-black">
                        {candidate.name}
                      </h3>
                      <p className="mt-1 text-xs text-zinc-600">
                        {[candidate.district, candidate.city, candidate.countryCode]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <Link
                      href={"/admin/discovery/" + candidate.id}
                      className="text-[10px] font-black text-zinc-500 hover:text-white"
                    >
                      Review →
                    </Link>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-zinc-500">
                    {candidate.phone && (
                      <span className="rounded-full border border-zinc-900 px-2 py-1">
                        Phone
                      </span>
                    )}
                    {candidate.email && (
                      <span className="rounded-full border border-zinc-900 px-2 py-1">
                        Email
                      </span>
                    )}
                    {candidate.website && (
                      <span className="rounded-full border border-zinc-900 px-2 py-1">
                        Website
                      </span>
                    )}
                    {candidate.instagram && (
                      <span className="rounded-full border border-zinc-900 px-2 py-1">
                        Instagram
                      </span>
                    )}
                  </div>

                  <div className="mt-4">
                    <OwnerInviteTools
                      studioName={candidate.name}
                      slug={candidate.slug}
                    />
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-8 rounded-3xl border border-zinc-900 bg-zinc-950/60 p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
                Owner activation
              </span>
              <h2 className="mt-2 text-2xl font-black">
                Verified-owner progress
              </h2>
            </div>
            <span className="text-xs text-zinc-600">
              {verifiedOwners.length} verified
            </span>
          </div>

          <div className="mt-5 space-y-3">
            {verifiedOwners.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-zinc-800 p-8 text-center text-sm text-zinc-600">
                No verified owner claims yet.
              </div>
            ) : (
              verifiedOwners.map(
                ({
                  candidate,
                  verifiedClaim,
                  readiness,
                  onboardingAvailable,
                }) => (
                  <article
                    key={candidate.id}
                    className="rounded-2xl border border-zinc-900 bg-black/20 p-5"
                  >
                    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_auto] lg:items-center">
                      <div>
                        <h3 className="font-black">
                          {candidate.name}
                        </h3>
                        <p className="mt-1 text-xs text-zinc-600">
                          {verifiedClaim?.claimant.name} ·{" "}
                          {verifiedClaim?.claimant.email}
                        </p>
                        <p className="mt-1 text-[10px] text-zinc-700">
                          Updated {dateLabel(candidate.updatedAt)}
                        </p>
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-black text-zinc-500">
                            Profile readiness
                          </span>
                          <b
                            className={
                              readiness.percent >= 75
                                ? "text-emerald-300"
                                : "text-amber-300"
                            }
                          >
                            {readiness.percent}%
                          </b>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-900">
                          <div
                            className="h-full rounded-full bg-acid"
                            style={{
                              width: readiness.percent + "%",
                            }}
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {readiness.steps
                            .filter((step) => !step.complete)
                            .slice(0, 3)
                            .map((step) => (
                              <span
                                key={step.key}
                                className="rounded-full border border-zinc-900 px-2 py-1 text-[9px] text-zinc-600"
                              >
                                {step.label}
                              </span>
                            ))}
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <Link
                          href={"/admin/discovery/" + candidate.id}
                          className="button-dark"
                        >
                          Open
                        </Link>
                        {candidate.convertedStudio ? (
                          <span className="rounded-xl border border-emerald-900/50 px-4 py-3 text-xs font-black text-emerald-300">
                            Converted
                          </span>
                        ) : readiness.readyForBookingOnboarding ? (
                          <span className="rounded-xl border border-acid/30 px-4 py-3 text-xs font-black text-acid">
                            Ready for booking
                          </span>
                        ) : onboardingAvailable ? (
                          <span className="rounded-xl border border-amber-900/40 px-4 py-3 text-xs font-black text-amber-300">
                            Complete profile
                          </span>
                        ) : (
                          <span className="rounded-xl border border-zinc-800 px-4 py-3 text-xs font-black text-zinc-600">
                            Directory only
                          </span>
                        )}
                      </div>
                    </div>
                  </article>
                ),
              )
            )}
          </div>
        </section>
      </section>
    </main>
  );
}
