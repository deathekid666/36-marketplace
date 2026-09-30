import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { StudioMap } from "@/components/StudioMap";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata = {
  title: "Discovery listing · 36",
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
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function DiscoveryStudioPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await getCurrentUser();
  const { slug } = await params;

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
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!candidate) notFound();

  if (candidate.status === "CONVERTED" && candidate.convertedStudio?.status === "VERIFIED") {
    redirect("/studios/" + candidate.convertedStudio.slug);
  }

  if (candidate.status !== "APPROVED" && candidate.status !== "CONVERTED") notFound();

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
  const ownershipVerified = candidate.claims.length > 0;
  const onboardingInProgress =
    candidate.status === "CONVERTED" && candidate.convertedStudio?.status !== "VERIFIED";
  const claimHref = "/discover/" + candidate.slug + "/claim";

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />

      <section className="mx-auto max-w-6xl px-5 py-10">
        <Link href="/discover" className="text-xs font-bold text-zinc-500 hover:text-white">
          ← Back to discovery
        </Link>

        <div className="mt-7 flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-sky-900/50 bg-sky-950/20 px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-sky-300">
                Discovery listing
              </span>
              <span className="text-[10px] font-black uppercase tracking-[0.1em] text-zinc-700">
                {labelCategory(candidate.category)}
              </span>
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              {candidate.name}
            </h1>
            <p className="mt-3 text-sm text-zinc-500">
              {[candidate.district, candidate.city, candidate.country].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="rounded-2xl border border-amber-900/50 bg-amber-950/10 px-5 py-4 text-right">
            <b className="text-sm text-amber-300">
              {onboardingInProgress ? "Owner onboarding in progress" : "Not yet bookable on 36"}
            </b>
            <p className="mt-1 max-w-xs text-xs leading-5 text-zinc-600">
              {onboardingInProgress
                ? "Ownership is verified and a private 36 listing is being completed. Booking stays disabled until marketplace verification."
                : "This studio has not completed owner onboarding and 36 verification."}
            </p>
          </div>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="space-y-7">
            <section className="panel">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-sky-300">
                Location
              </span>
              <h2 className="mt-3 text-2xl font-black">
                {candidate.district ? candidate.district + ", " : ""}
                {candidate.city || candidate.country || "Location"}
              </h2>
              <p className="mt-2 text-sm text-zinc-500">
                {candidate.address || "Address details are limited to the provider evidence currently available."}
              </p>
              {mapPoints.length > 0 && (
                <div className="mt-5">
                  <StudioMap points={mapPoints} />
                </div>
              )}
            </section>

            <section className="panel">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-sky-300">
                Source transparency
              </span>
              <h2 className="mt-3 text-2xl font-black">Why this listing exists</h2>
              <p className="mt-3 text-sm leading-7 text-zinc-500">
                36 found this place in external location data, normalized the record, checked it for likely duplicates, and required admin review before making it visible here.
              </p>

              <div className="mt-5 space-y-3">
                {candidate.sources.map((source) => {
                  const sourceUrl = safeExternalUrl(source.sourceUrl);
                  const licenseUrl = safeExternalUrl(source.licenseUrl);

                  return (
                    <article key={source.id} className="rounded-xl border border-zinc-900 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <b className="text-sm">{source.provider}</b>
                          {source.attribution && (
                            <p className="mt-1 text-xs text-zinc-600">{source.attribution}</p>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-700">
                          Evidence source
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
                Discovery status
              </span>
              <h2 className="mt-3 text-2xl font-black">Found on 36, not bookable yet</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-500">
                Booking, pricing, rooms, reviews and live availability only appear after a real studio owner joins 36 and passes verification.
              </p>

              {website && (
                <a
                  href={website}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="button-dark mt-5 inline-flex w-full justify-center"
                >
                  Visit public website ↗
                </a>
              )}

              {onboardingInProgress ? (
                <div className="mt-5 rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-4">
                  <b className="text-sm text-emerald-300">Claim verified · onboarding started</b>
                  <p className="mt-1 text-xs leading-5 text-zinc-600">
                    A real studio representative is building the authoritative 36 listing now.
                  </p>
                </div>
              ) : ownershipVerified ? (
                <div className="mt-5 rounded-xl border border-emerald-900/40 bg-emerald-950/10 p-4">
                  <b className="text-sm text-emerald-300">Ownership claim verified</b>
                  <p className="mt-1 text-xs leading-5 text-zinc-600">
                    A verified studio representative is connected to this discovery listing. 36 onboarding is still required before booking can start.
                  </p>
                </div>
              ) : user?.role === "STUDIO_OWNER" ? (
                <Link
                  href={claimHref}
                  className="mt-5 inline-flex w-full justify-center rounded-xl bg-sky-300 px-5 py-3.5 text-sm font-black text-black"
                >
                  Claim this studio
                </Link>
              ) : !user ? (
                <Link
                  href={`/auth/login?next=${encodeURIComponent(claimHref)}`}
                  className="mt-5 inline-flex w-full justify-center rounded-xl bg-sky-300 px-5 py-3.5 text-sm font-black text-black"
                >
                  Claim this studio
                </Link>
              ) : (
                <div className="mt-5 rounded-xl border border-zinc-900 p-4 text-xs leading-5 text-zinc-600">
                  Ownership claims require a Studio Owner account.
                </div>
              )}

              <Link
                href="/studios"
                className="mt-3 inline-flex w-full justify-center rounded-xl bg-acid px-5 py-3.5 text-sm font-black text-black"
              >
                Browse bookable studios
              </Link>

              <p className="mt-4 text-center text-[10px] leading-5 text-zinc-700">
                Claim verification does not create prices, rooms or booking availability.
              </p>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
