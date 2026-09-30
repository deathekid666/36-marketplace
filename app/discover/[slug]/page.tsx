import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { submitDiscoveryContactReportAction } from "@/app/discover/[slug]/report-actions";
import { AppHeader } from "@/components/AppHeader";
import { StudioMap } from "@/components/StudioMap";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  discoveryFreshness,
  discoveryFreshnessClass,
  discoveryFreshnessLabel,
} from "@/lib/discovery/freshness";
import { isDirectoryStudioIdentity } from "@/lib/discovery/public-eligibility";
import { isDiscoveryRolloutEnabled } from "@/lib/discovery/rollout";

export const metadata = {
  title: "Studio contact · 36",
};

function labelCategory(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function safeExternalUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function cleanPhoneHref(value: string) {
  return "tel:" + value.replace(/[^+\d]/g, "");
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });

function countryName(code: string | null | undefined) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(normalized)) return normalized || "Unknown country";
  try {
    return regionNames.of(normalized) || normalized;
  } catch {
    return normalized;
  }
}

export default async function DiscoveryStudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ report?: string }>;
}) {
  const user = await getCurrentUser();
  const { slug } = await params;
  const query = await searchParams;

  const candidate = await db.candidateStudio.findUnique({
    where: { slug },
    include: {
      sources: {
        where: { active: true },
        orderBy: { collectedAt: "desc" },
      },
      convertedStudio: {
        select: { slug: true, status: true },
      },
      claims: {
        where: { status: "VERIFIED" },
        select: { id: true, claimantId: true },
        take: 1,
      },
    },
  });

  if (!candidate || !candidate.phone) notFound();

  if (
    candidate.status === "CONVERTED" &&
    candidate.convertedStudio?.status === "VERIFIED"
  ) {
    redirect("/studios/" + candidate.convertedStudio.slug);
  }

  if (
    candidate.status !== "ENRICHED" &&
    candidate.status !== "APPROVED" &&
    candidate.status !== "CONVERTED"
  ) {
    notFound();
  }

  if (!isDiscoveryRolloutEnabled(candidate, "PUBLIC_DISCOVERY")) notFound();

  const freshness = discoveryFreshness(candidate.lastCheckedAt);
  const ownershipVerified = candidate.claims.length > 0;
  const studioIdentity = isDirectoryStudioIdentity({
    name: candidate.name,
    providerCategories: candidate.sources.map((source) => source.providerCategory),
  });

  if (
    candidate.status === "ENRICHED" &&
    !ownershipVerified &&
    !studioIdentity
  ) {
    notFound();
  }

  if (
    candidate.status !== "CONVERTED" &&
    !ownershipVerified &&
    (freshness === "STALE" || freshness === "UNKNOWN")
  ) {
    notFound();
  }

  const claimsEnabled =
    (candidate.status === "ENRICHED" || candidate.status === "APPROVED") &&
    isDiscoveryRolloutEnabled(candidate, "CLAIMS");

  const mapPoints =
    candidate.latitude != null && candidate.longitude != null
      ? [
          {
            id: candidate.id,
            name: candidate.name,
            lat: Number(candidate.latitude),
            lng: Number(candidate.longitude),
            href: "/discover/" + candidate.slug,
            price: null,
          },
        ]
      : [];

  const website = safeExternalUrl(candidate.website);
  const verifiedClaim = candidate.claims[0] || null;
  const ownedByCurrentUser =
    Boolean(user && verifiedClaim && user.id === verifiedClaim.claimantId);
  const onboardingInProgress =
    candidate.status === "CONVERTED" &&
    candidate.convertedStudio?.status !== "VERIFIED";
  const reviewed =
    candidate.status === "APPROVED" || candidate.status === "CONVERTED";
  const claimHref = "/discover/" + candidate.slug + "/claim";

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />

      <section className="mx-auto max-w-6xl px-5 py-10">
        <Link
          href="/discover"
          className="text-xs font-bold text-zinc-500 hover:text-white"
        >
          ← Back to global contacts
        </Link>

        <div className="mt-7 flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={
                  "rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] " +
                  (reviewed
                    ? "border-sky-900/50 bg-sky-950/20 text-sky-300"
                    : "border-zinc-800 text-zinc-400")
                }
              >
                {ownershipVerified
                  ? "Owner verified"
                  : reviewed
                    ? "Reviewed contact"
                    : "Provider-sourced contact"}
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-zinc-700">
                {labelCategory(candidate.category)}
              </span>
              {candidate.status !== "CONVERTED" && (
                <span
                  className={
                    "rounded-full border px-2.5 py-1 text-[9px] font-black uppercase " +
                    discoveryFreshnessClass(freshness)
                  }
                >
                  {discoveryFreshnessLabel(freshness)}
                </span>
              )}
            </div>

            <h1 className="mt-4 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              {candidate.name}
            </h1>
            <p className="mt-3 text-sm text-zinc-500">
              {[
                candidate.district,
                candidate.city,
                candidate.countryCode ? countryName(candidate.countryCode) : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-900/50 bg-amber-950/10 px-5 py-4 text-right">
            <b className="text-sm text-amber-300">
              {onboardingInProgress
                ? "Owner onboarding in progress"
                : "Contact only · not bookable"}
            </b>
            <p className="mt-1 max-w-xs text-xs leading-5 text-zinc-600">
              {reviewed
                ? "36 has reviewed this discovery record, but booking remains disabled until a real studio completes marketplace verification."
                : "This phone number comes from public provider data and has not been independently verified by 36."}
            </p>
          </div>
        </div>

        {query.report === "submitted" && (
          <div className="mt-6 rounded-xl border border-emerald-900/50 bg-emerald-950/10 p-4 text-sm text-emerald-300">
            Thanks. The directory issue was sent to the 36 admin review queue.
          </div>
        )}
        {query.report === "rate-limited" && (
          <div className="mt-6 rounded-xl border border-amber-900/50 bg-amber-950/10 p-4 text-sm text-amber-300">
            You have already reported this listing recently. The existing report remains in the review queue.
          </div>
        )}
        {query.report === "invalid" && (
          <div className="mt-6 rounded-xl border border-red-900/50 bg-red-950/10 p-4 text-sm text-red-300">
            Choose a valid report reason and try again.
          </div>
        )}

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-7">
            <section className="panel">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-sky-300">
                Public contact
              </span>
              <h2 className="mt-3 text-2xl font-black">Call the studio</h2>
              <a
                href={cleanPhoneHref(candidate.phone)}
                className="mt-5 flex items-center justify-between rounded-2xl border border-sky-900/50 bg-sky-950/10 px-5 py-4 transition hover:border-sky-700"
              >
                <span className="text-sm text-zinc-500">☎ Phone</span>
                <b className="text-lg text-sky-300">{candidate.phone}</b>
              </a>

              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="button-dark mt-3 inline-flex"
                >
                  Visit public website ↗
                </a>
              )}
            </section>

            <section className="panel">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-sky-300">
                Location
              </span>
              <h2 className="mt-3 text-2xl font-black">
                {candidate.district ? candidate.district + ", " : ""}
                {candidate.city ||
                  (candidate.countryCode ? countryName(candidate.countryCode) : "Location")}
              </h2>
              <p className="mt-2 text-sm text-zinc-500">
                {candidate.address ||
                  "Address details are limited to the public provider evidence currently available."}
              </p>

              {mapPoints.length > 0 && (
                <div className="mt-5">
                  <StudioMap points={mapPoints} />
                </div>
              )}
            </section>

            <section className="panel">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-sky-300">
                Report directory data
              </span>
              <h2 className="mt-3 text-2xl font-black">Something wrong?</h2>
              <p className="mt-3 text-sm leading-7 text-zinc-500">
                Report a wrong phone number, closed business, duplicate listing or other directory problem. Reports go to the admin review queue and never change the listing automatically.
              </p>

              {user ? (
                <form action={submitDiscoveryContactReportAction} className="mt-5 space-y-3">
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <input type="hidden" name="slug" value={candidate.slug} />
                  <select name="reason" required className="field">
                    <option value="">Choose a reason</option>
                    <option value="PHONE_WRONG">Phone number is wrong</option>
                    <option value="BUSINESS_CLOSED">Business appears closed</option>
                    <option value="WRONG_STUDIO">This is not a studio / wrong business</option>
                    <option value="WRONG_LOCATION">Location or address is wrong</option>
                    <option value="WEBSITE_BROKEN">Website is wrong or broken</option>
                    <option value="DUPLICATE">Duplicate listing</option>
                    <option value="OTHER">Other issue</option>
                  </select>
                  <textarea
                    name="details"
                    maxLength={1200}
                    className="field min-h-24"
                    placeholder="Optional details that help us verify the issue"
                  />
                  <button className="button-dark w-full">Send report</button>
                </form>
              ) : (
                <Link
                  href={"/auth/login?next=" + encodeURIComponent("/discover/" + candidate.slug)}
                  className="button-dark mt-5 inline-flex"
                >
                  Sign in to report an issue
                </Link>
              )}
            </section>

            <section className="panel">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-sky-300">
                Source transparency
              </span>
              <h2 className="mt-3 text-2xl font-black">
                Where this contact came from
              </h2>
              <p className="mt-3 text-sm leading-7 text-zinc-500">
                36 stores public business contact data with its provider source
                and freshness timestamp. Provider-sourced contacts may change,
                so call details should be treated as directory information rather
                than owner-verified marketplace data.
              </p>

              <div className="mt-5 space-y-3">
                {candidate.sources.map((source) => {
                  const sourceUrl = safeExternalUrl(source.sourceUrl);
                  const licenseUrl = safeExternalUrl(source.licenseUrl);

                  return (
                    <article
                      key={source.id}
                      className="rounded-xl border border-zinc-900 p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <b className="text-sm">{source.provider}</b>
                          {source.attribution && (
                            <p className="mt-1 text-xs text-zinc-600">
                              {source.attribution}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-700">
                          Public directory source
                        </span>
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
                              Attribution / license ↗
                            </a>
                          )}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="self-start lg:sticky lg:top-6">
            <section className="rounded-3xl border border-zinc-800 bg-[#11120f] p-6 shadow-2xl">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-sky-300">
                Directory status
              </span>
              <h2 className="mt-3 text-2xl font-black">
                Contact the studio directly
              </h2>
              <p className="mt-3 text-sm leading-6 text-zinc-500">
                There is no 36 price, availability or payment flow for this
                listing. The phone number is shown only as public business
                contact information.
              </p>

              <a
                href={cleanPhoneHref(candidate.phone)}
                className="mt-5 inline-flex w-full justify-center rounded-xl bg-sky-300 px-5 py-3.5 text-sm font-black text-black"
              >
                Call {candidate.phone}
              </a>

              {onboardingInProgress ? (
                <div className="mt-4 rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-4">
                  <b className="text-sm text-emerald-300">
                    Claim verified · onboarding started
                  </b>
                </div>
              ) : ownershipVerified ? (
                <div className="mt-4 rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-4">
                  <b className="text-sm text-emerald-300">
                    Ownership claim verified
                  </b>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Contact details may now be maintained by a verified studio representative.
                  </p>
                  {ownedByCurrentUser && verifiedClaim ? (
                    <Link
                      href={"/owner/claims/" + verifiedClaim.id + "/profile"}
                      className="button-dark mt-3 inline-flex w-full justify-center"
                    >
                      Manage public profile
                    </Link>
                  ) : null}
                </div>
              ) : claimsEnabled && user?.role === "STUDIO_OWNER" ? (
                <Link
                  href={claimHref}
                  className="button-dark mt-4 inline-flex w-full justify-center"
                >
                  Claim this studio
                </Link>
              ) : claimsEnabled && !user ? (
                <Link
                  href={"/auth/login?next=" + encodeURIComponent(claimHref)}
                  className="button-dark mt-4 inline-flex w-full justify-center"
                >
                  Claim this studio
                </Link>
              ) : null}

              <Link
                href="/studios"
                className="mt-3 inline-flex w-full justify-center rounded-xl bg-acid px-5 py-3.5 text-sm font-black text-black"
              >
                Browse bookable studios
              </Link>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
