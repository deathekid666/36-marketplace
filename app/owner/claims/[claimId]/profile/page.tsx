import { DiscoveryStudioCategory } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateClaimedDirectoryProfileAction } from "@/app/owner/claims/[claimId]/profile/actions";
import { AppHeader } from "@/components/AppHeader";
import { StudioPhotoUploader } from "@/components/StudioPhotoUploader";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { parseDirectoryProfileV2 } from "@/lib/discovery/profile-v2";
import { isDiscoveryRolloutEnabled } from "@/lib/discovery/rollout";

export const metadata = { title: "Manage directory profile · 36" };

const ERRORS: Record<string, string> = {
  "name-required": "Enter the studio name.",
  "phone-required": "A public business phone number is required for the directory listing.",
  "email-invalid": "Enter a valid public business email or leave it empty.",
  "url-invalid": "Website and Instagram fields must be valid http or https URLs.",
  "url-unsafe": "Local/private-network URLs and URLs containing credentials are not accepted.",
  "photo-url-invalid": "Every photo must be a valid public http or https image URL.",
  "whatsapp-invalid": "Enter a valid WhatsApp phone number or leave it empty.",
  "claim-not-verified": "Ownership must be verified before you can edit this directory profile.",
  "candidate-unavailable": "This directory listing can no longer be edited.",
  "use-booking-listing": "This studio has already moved into booking onboarding. Edit the 36 Studio listing instead.",
  "account-invalid": "Your Studio Owner account must be active and email verified.",
  "save-failed": "The directory profile could not be saved.",
};

function labelCategory(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function ClaimedDirectoryProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ claimId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const user = await requireRole("STUDIO_OWNER");
  const { claimId } = await params;
  const query = await searchParams;

  const claim = await db.candidateStudioClaim.findFirst({
    where: {
      id: claimId,
      claimantId: user.id,
      status: "VERIFIED",
    },
    include: {
      candidateStudio: {
        include: {
          convertedStudio: {
            select: { id: true },
          },
          sources: {
            where: { active: true },
            select: { id: true, provider: true },
            orderBy: { collectedAt: "desc" },
            take: 4,
          },
          transitions: {
            where: { reasonCode: "VERIFIED_OWNER_PROFILE_UPDATE" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { metadata: true },
          },
        },
      },
    },
  });

  if (!claim) notFound();

  const candidate = claim.candidateStudio;
  const profileV2 = parseDirectoryProfileV2(
    candidate.transitions[0]?.metadata,
  );
  const canStartBooking =
    candidate.status !== "CONVERTED" &&
    isDiscoveryRolloutEnabled(candidate, "ONBOARDING");

  if (candidate.status === "CONVERTED" && candidate.convertedStudio) {
    return (
      <main className="min-h-screen">
        <AppHeader user={user} />
        <section className="mx-auto max-w-3xl px-5 py-14">
          <div className="rounded-3xl border border-emerald-900/40 bg-emerald-950/10 p-7">
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-300">
              Booking onboarding
            </span>
            <h1 className="mt-3 text-3xl font-black">{candidate.name}</h1>
            <p className="mt-3 text-sm leading-6 text-zinc-500">
              This claimed directory record has already been converted into a private 36 Studio draft. Continue editing the marketplace listing there.
            </p>
            <Link
              href={"/owner/studios/" + candidate.convertedStudio.id}
              className="mt-5 inline-flex rounded-xl bg-acid px-5 py-3 text-sm font-black text-black"
            >
              Open 36 Studio
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-5xl px-5 py-12">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href="/owner/claims" className="text-xs font-bold text-zinc-500 hover:text-white">
              ← Your claims
            </Link>
            <span className="mt-6 block text-xs font-bold uppercase tracking-[0.16em] text-sky-300">
              Verified owner profile
            </span>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.04em]">
              Manage {candidate.name}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-zinc-500">
              These fields control the public contact-only directory listing. Editing them does not create rooms, pricing, availability, payments or bookings.
            </p>
          </div>
          <Link href={"/discover/" + candidate.slug} className="button-dark">
            View public profile ↗
          </Link>
        </div>

        {query.saved === "1" && (
          <div className="mt-6 rounded-xl border border-emerald-900/50 bg-emerald-950/10 p-4 text-sm text-emerald-300">
            Public directory profile updated.
          </div>
        )}
        {query.error && ERRORS[query.error] && (
          <div className="mt-6 rounded-xl border border-red-900/50 bg-red-950/10 p-4 text-sm text-red-300">
            {ERRORS[query.error]}
          </div>
        )}

        <div className="mt-8 grid gap-7 lg:grid-cols-[1fr_300px]">
          <form
            action={updateClaimedDirectoryProfileAction}
            className="space-y-5 rounded-3xl border border-zinc-800 bg-[#11120f] p-6"
          >
            <input type="hidden" name="claimId" value={claim.id} />

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="label">Studio name</span>
                <input name="name" required defaultValue={candidate.name} className="field" />
              </label>

              <label>
                <span className="label">Studio type</span>
                <select name="category" defaultValue={candidate.category} className="field">
                  {Object.values(DiscoveryStudioCategory).map((value) => (
                    <option key={value} value={value}>
                      {labelCategory(value)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span className="label">Public phone</span>
                <input name="phone" required defaultValue={candidate.phone || ""} className="field" />
              </label>

              <label>
                <span className="label">Public email</span>
                <input name="email" type="email" defaultValue={candidate.email || ""} className="field" />
              </label>

              <label>
                <span className="label">Website</span>
                <input name="website" type="url" defaultValue={candidate.website || ""} className="field" placeholder="https://..." />
              </label>

              <label className="sm:col-span-2">
                <span className="label">Instagram URL</span>
                <input name="instagram" type="url" defaultValue={candidate.instagram || ""} className="field" placeholder="https://instagram.com/..." />
              </label>

              <label>
                <span className="label">City</span>
                <input name="city" defaultValue={candidate.city || ""} className="field" />
              </label>

              <label>
                <span className="label">Region / state</span>
                <input name="region" defaultValue={candidate.region || ""} className="field" />
              </label>

              <label>
                <span className="label">District / neighborhood</span>
                <input name="district" defaultValue={candidate.district || ""} className="field" />
              </label>

              <label>
                <span className="label">Postal code</span>
                <input name="postalCode" defaultValue={candidate.postalCode || ""} className="field" />
              </label>

              <label className="sm:col-span-2">
                <span className="label">Address</span>
                <textarea name="address" defaultValue={candidate.address || ""} className="field min-h-24" />
              </label>
            </div>

            <div className="border-t border-zinc-900 pt-6">
              <span className="text-xs font-black uppercase tracking-[0.14em] text-sky-300">
                Rich public profile
              </span>
              <p className="mt-2 text-xs leading-5 text-zinc-600">
                These fields make the contact page feel like a real studio profile while remaining separate from booking.
              </p>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2">
                  <span className="label">Studio description</span>
                  <textarea
                    name="description"
                    maxLength={2400}
                    defaultValue={profileV2.description}
                    className="field min-h-32"
                    placeholder="Describe the studio, the kind of work you do, rooms, sound, atmosphere and who it is for."
                  />
                </label>

                <label>
                  <span className="label">WhatsApp number</span>
                  <input
                    name="whatsapp"
                    maxLength={80}
                    defaultValue={profileV2.whatsapp}
                    className="field"
                    placeholder="+212..."
                  />
                </label>

                <label>
                  <span className="label">Languages</span>
                  <input
                    name="languages"
                    defaultValue={profileV2.languages.join(", ")}
                    className="field"
                    placeholder="Arabic, French, English"
                  />
                </label>

                <label>
                  <span className="label">Services</span>
                  <textarea
                    name="services"
                    defaultValue={profileV2.services.join("\n")}
                    className="field min-h-32"
                    placeholder={"Recording\nMixing\nMastering\nPodcast production"}
                  />
                  <span className="mt-1 block text-[10px] text-zinc-700">
                    One per line or comma-separated.
                  </span>
                </label>

                <label>
                  <span className="label">Equipment</span>
                  <textarea
                    name="equipment"
                    defaultValue={profileV2.equipment.join("\n")}
                    className="field min-h-32"
                    placeholder={"Neumann U87\nApollo x8\nYamaha HS8"}
                  />
                  <span className="mt-1 block text-[10px] text-zinc-700">
                    One per line or comma-separated.
                  </span>
                </label>

                <label className="sm:col-span-2">
                  <span className="label">Opening hours</span>
                  <textarea
                    name="openingHours"
                    maxLength={1000}
                    defaultValue={profileV2.openingHours}
                    className="field min-h-24"
                    placeholder={"Mon–Fri 10:00–22:00\nSat–Sun 12:00–20:00"}
                  />
                </label>

                <StudioPhotoUploader
                  claimId={claim.id}
                  initialUrls={profileV2.photoUrls}
                />
              </div>
            </div>

            <button className="w-full rounded-xl bg-sky-300 px-5 py-4 text-sm font-black text-black">
              Save public profile
            </button>
          </form>

          <aside className="space-y-4 self-start lg:sticky lg:top-6">
            <div className="rounded-2xl border border-emerald-900/40 bg-emerald-950/10 p-5">
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-emerald-300">
                Ownership verified
              </span>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Your changes are treated as verified-owner directory data and are logged in the discovery audit history.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-900 bg-zinc-950/70 p-5">
              <span className="label">Source evidence retained</span>
              <div className="mt-3 flex flex-wrap gap-2">
                {candidate.sources.map((source) => (
                  <span key={source.id} className="rounded-full border border-zinc-800 px-2.5 py-1 text-[10px] text-zinc-500">
                    {source.provider}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-zinc-600">
                Provider records stay attached for transparency; owner edits do not delete source provenance.
              </p>
            </div>

            <div className="rounded-2xl border border-zinc-900 bg-zinc-950/70 p-5">
              <span className="label">Booking status</span>
              <b className="mt-2 block text-sm text-amber-300">Not bookable</b>
              <p className="mt-2 text-xs leading-5 text-zinc-600">
                {canStartBooking
                  ? "Booking onboarding is available in this market, but starts only when you explicitly choose it from Your Claims."
                  : "Booking onboarding is not launched in this market yet. The contact directory remains fully usable."}
              </p>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
