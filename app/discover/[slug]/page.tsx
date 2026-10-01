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
import {
  parseDirectoryProfileV2,
  profileV2Completeness,
  whatsappUrl,
} from "@/lib/discovery/profile-v2";
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
      transitions: {
        where: { reasonCode: "VERIFIED_OWNER_PROFILE_UPDATE" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { metadata: true },
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
  const instagram = safeExternalUrl(candidate.instagram);
  const verifiedClaim = candidate.claims[0] || null;
  const profileV2 = ownershipVerified
    ? parseDirectoryProfileV2(candidate.transitions[0]?.metadata)
    : parseDirectoryProfileV2(null);
  const richProfileScore = profileV2Completeness(profileV2);
  const whatsapp = whatsappUrl(profileV2.whatsapp);
  const ownedByCurrentUser =
    Boolean(user && verifiedClaim && user.id === verifiedClaim.claimantId);
  const onboardingInProgress =
    candidate.status === "CONVERTED" &&
    candidate.convertedStudio?.status !== "VERIFIED";
  const reviewed =
    candidate.status === "APPROVED" || candidate.status === "CONVERTED";
  const claimHref = "/discover/" + candidate.slug + "/claim";

  return (
    <main className="min-h-screen bg-white text-[#222]">
      <AppHeader user={user} />

      <section className="mx-auto max-w-6xl px-5 py-10">
        <Link
          href="/discover"
          className="text-xs font-bold text-[#717171] hover:text-[#222222]"
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
                    ? "border-sky-200/50 bg-sky-950/20 text-sky-600"
                    : "border-[#dddddd] text-[#555555]")
                }
              >
                {ownershipVerified
                  ? "Owner verified"
                  : reviewed
                    ? "Reviewed contact"
                    : "Provider-sourced contact"}
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[#a3a3a3]">
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
            <p className="mt-3 text-sm text-[#717171]">
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
            <b className="text-sm text-amber-600">
              {onboardingInProgress
                ? "Owner onboarding in progress"
                : "Contact only · not bookable"}
            </b>
            <p className="mt-1 max-w-xs text-xs leading-5 text-[#8a8a8a]">
              {reviewed
                ? "36 has reviewed this discovery record, but booking remains disabled until a real studio completes marketplace verification."
                : "This phone number comes from public provider data and has not been independently verified by 36."}
            </p>
          </div>
        </div>

        {ownershipVerified && profileV2.photoUrls.length > 0 && (
          <section className="mt-8 overflow-hidden rounded-3xl border border-[#dddddd] bg-white">
            <div className="grid gap-1 sm:grid-cols-2">
              <a
                href={profileV2.photoUrls[0]}
                target="_blank"
                rel="noreferrer noopener"
                className={profileV2.photoUrls.length === 1 ? "sm:col-span-2" : ""}
              >
                <img
                  src={profileV2.photoUrls[0]}
                  alt={candidate.name + " studio"}
                  loading="eager"
                  referrerPolicy="no-referrer"
                  className="h-72 w-full object-cover sm:h-[420px]"
                />
              </a>
              {profileV2.photoUrls.length > 1 && (
                <div className="grid grid-cols-2 gap-1">
                  {profileV2.photoUrls.slice(1, 5).map((photo, index) => (
                    <a
                      key={photo}
                      href={photo}
                      target="_blank"
                      rel="noreferrer noopener"
                      className={profileV2.photoUrls.length === 2 ? "col-span-2" : ""}
                    >
                      <img
                        src={photo}
                        alt={candidate.name + " studio photo " + (index + 2)}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="h-36 w-full object-cover sm:h-[208px]"
                      />
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#ebebeb] px-5 py-3">
              <span className="text-xs font-bold text-emerald-600">
                Photos maintained by verified owner
              </span>
              <span className="text-[10px] uppercase tracking-[0.12em] text-[#8a8a8a]">
                {profileV2.photoUrls.length} photo{profileV2.photoUrls.length === 1 ? "" : "s"}
              </span>
            </div>
          </section>
        )}

        {query.report === "submitted" && (
          <div className="mt-6 rounded-xl border border-emerald-900/50 bg-emerald-950/10 p-4 text-sm text-emerald-600">
            Thanks. The directory issue was sent to the 36 admin review queue.
          </div>
        )}
        {query.report === "rate-limited" && (
          <div className="mt-6 rounded-xl border border-amber-900/50 bg-amber-950/10 p-4 text-sm text-amber-600">
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
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">
                Public contact
              </span>
              <h2 className="mt-3 text-2xl font-black">Call the studio</h2>
              <a
                href={cleanPhoneHref(candidate.phone)}
                className="mt-5 flex items-center justify-between rounded-2xl border border-sky-200/50 bg-sky-950/10 px-5 py-4 transition hover:border-sky-700"
              >
                <span className="text-sm text-[#717171]">☎ Phone</span>
                <b className="text-lg text-sky-600">{candidate.phone}</b>
              </a>

              <div className="mt-3 flex flex-wrap gap-2">
                {whatsapp && (
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-xl border border-emerald-900/50 bg-emerald-950/10 px-4 py-3 text-xs font-black text-emerald-600 hover:border-emerald-700"
                  >
                    WhatsApp ↗
                  </a>
                )}
                {candidate.email && (
                  <a href={"mailto:" + candidate.email} className="button-dark">
                    Email
                  </a>
                )}
                {website && (
                  <a
                    href={website}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="button-dark"
                  >
                    Website ↗
                  </a>
                )}
                {instagram && (
                  <a
                    href={instagram}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="button-dark"
                  >
                    Instagram ↗
                  </a>
                )}
              </div>
            </section>

            {ownershipVerified && richProfileScore > 0 && (
              <section className="panel">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-600">
                    Verified owner profile
                  </span>
                  <span className="rounded-full border border-emerald-900/40 px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-600">
                    Owner maintained
                  </span>
                </div>

                {profileV2.description && (
                  <>
                    <h2 className="mt-3 text-2xl font-black">About this studio</h2>
                    <p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#555555]">
                      {profileV2.description}
                    </p>
                  </>
                )}

                {profileV2.services.length > 0 && (
                  <div className="mt-6">
                    <span className="label">Services</span>
                    <div className="flex flex-wrap gap-2">
                      {profileV2.services.map((service) => (
                        <span
                          key={service}
                          className="rounded-full border border-sky-200/40 bg-sky-950/10 px-3 py-1.5 text-xs font-bold text-sky-600"
                        >
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {profileV2.equipment.length > 0 && (
                  <div className="mt-6">
                    <span className="label">Equipment</span>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {profileV2.equipment.map((item) => (
                        <div
                          key={item}
                          className="rounded-xl border border-[#ebebeb] bg-[#f7f7f7] px-4 py-3 text-sm text-[#333333]"
                        >
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(profileV2.languages.length > 0 || profileV2.openingHours) && (
                  <div className="mt-6 grid gap-4 sm:grid-cols-2">
                    {profileV2.languages.length > 0 && (
                      <div className="rounded-2xl border border-[#ebebeb] p-4">
                        <span className="label">Languages</span>
                        <p className="text-sm leading-6 text-[#333333]">
                          {profileV2.languages.join(" · ")}
                        </p>
                      </div>
                    )}
                    {profileV2.openingHours && (
                      <div className="rounded-2xl border border-[#ebebeb] p-4">
                        <span className="label">Opening hours</span>
                        <p className="whitespace-pre-line text-sm leading-6 text-[#333333]">
                          {profileV2.openingHours}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            <section className="panel">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">
                Location
              </span>
              <h2 className="mt-3 text-2xl font-black">
                {candidate.district ? candidate.district + ", " : ""}
                {candidate.city ||
                  (candidate.countryCode ? countryName(candidate.countryCode) : "Location")}
              </h2>
              <p className="mt-2 text-sm text-[#717171]">
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
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">
                Report directory data
              </span>
              <h2 className="mt-3 text-2xl font-black">Something wrong?</h2>
              <p className="mt-3 text-sm leading-7 text-[#717171]">
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
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">
                Source transparency
              </span>
              <h2 className="mt-3 text-2xl font-black">
                Where this contact came from
              </h2>
              <p className="mt-3 text-sm leading-7 text-[#717171]">
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
                      className="rounded-xl border border-[#ebebeb] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <b className="text-sm">{source.provider}</b>
                          {source.attribution && (
                            <p className="mt-1 text-xs text-[#8a8a8a]">
                              {source.attribution}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] text-[#a3a3a3]">
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
            <section className="rounded-3xl border border-[#dddddd] bg-white p-6 shadow-2xl">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-sky-600">
                Directory status
              </span>
              <h2 className="mt-3 text-2xl font-black">
                Contact the studio directly
              </h2>
              <p className="mt-3 text-sm leading-6 text-[#717171]">
                There is no 36 price, availability or payment flow for this
                listing. The phone number is shown only as public business
                contact information.
              </p>

              <div className="mt-5 grid gap-2">
                <a
                  href={cleanPhoneHref(candidate.phone)}
                  className="inline-flex w-full justify-center rounded-xl bg-sky-300 px-5 py-3.5 text-sm font-black text-black"
                >
                  Call {candidate.phone}
                </a>
                {whatsapp && (
                  <a
                    href={whatsapp}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex w-full justify-center rounded-xl border border-emerald-900/50 bg-emerald-950/10 px-5 py-3.5 text-sm font-black text-emerald-600"
                  >
                    Message on WhatsApp
                  </a>
                )}
              </div>

              {onboardingInProgress ? (
                <div className="mt-4 rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-4">
                  <b className="text-sm text-emerald-600">
                    Claim verified · onboarding started
                  </b>
                </div>
              ) : ownershipVerified ? (
                <div className="mt-4 rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-4">
                  <b className="text-sm text-emerald-600">
                    Ownership claim verified
                  </b>
                  <p className="mt-1 text-xs leading-5 text-[#717171]">
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
                className="mt-3 inline-flex w-full justify-center rounded-xl bg-acid px-5 py-3.5 text-sm font-black text-white"
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
