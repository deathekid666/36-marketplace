import Link from "next/link";
import type { UserRole } from "@prisma/client";

import { updateProfileAction } from "@/app/profile/actions";
import {
  memberSinceLabel,
  profileInitials,
  profileRoleLabel,
  yearsSince,
} from "@/lib/profile";

type ProfileStudio = {
  id: string;
  name: string;
  slug: string;
  city: string;
  neighborhood: string;
  photoUrl: string | null;
  priceMad: number | null;
  rating: number | null;
  reviewCount: number;
};

type ProfileReview = {
  id: string;
  rating: number;
  comment: string;
  createdAt: Date;
  studioName: string;
  studioSlug: string;
  personName?: string | null;
  personId?: string | null;
  direction: "WRITTEN" | "RECEIVED";
};

function PremiumFallbackVisual() {
  return (
    <div className="profile-visual-stage" aria-hidden="true">
      <div className="profile-orbit profile-orbit-one" />
      <div className="profile-orbit profile-orbit-two" />
      <div className="profile-orbit profile-orbit-three" />
      <div className="profile-record">
        <div className="profile-record-grooves" />
        <div className="profile-record-label">36</div>
      </div>
      <div className="profile-light-beam profile-light-beam-one" />
      <div className="profile-light-beam profile-light-beam-two" />
    </div>
  );
}

function StudioFallback() {
  return (
    <div className="relative grid h-full place-items-center overflow-hidden bg-[radial-gradient(circle_at_35%_25%,rgba(217,255,67,.18),transparent_30%),radial-gradient(circle_at_80%_75%,rgba(125,211,252,.14),transparent_30%),linear-gradient(145deg,#161814,#090a08)]">
      <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.04)_1px,transparent_1px)] [background-size:28px_28px]" />
      <div className="profile-mini-record">
        <span>36</span>
      </div>
    </div>
  );
}

export function AirbnbUserProfile({
  profile,
  studios,
  reviews,
  isSelf = false,
  email,
  phone,
  saved,
  error,
}: {
  profile: {
    id: string;
    name: string;
    role: UserRole;
    emailVerified: boolean;
    createdAt: Date;
    completedSessions: number;
    reviewCount: number;
    averageRating: number | null;
  };
  studios: ProfileStudio[];
  reviews: ProfileReview[];
  isSelf?: boolean;
  email?: string;
  phone?: string | null;
  saved?: boolean;
  error?: string;
}) {
  const years = yearsSince(profile.createdAt);
  const isOwner = profile.role === "STUDIO_OWNER";
  const publicRole = profileRoleLabel(profile.role);
  const initials = profileInitials(profile.name) || "36";
  const coverStudio = studios.find((studio) => Boolean(studio.photoUrl));
  const coverUrl = coverStudio?.photoUrl || null;
  const primaryStat = isOwner ? studios.length : profile.completedSessions;
  const primaryStatLabel = isOwner ? "Studios" : "Sessions";
  const ratingLabel =
    profile.averageRating != null ? profile.averageRating.toFixed(1) : "New";

  return (
    <div className="profile-premium-shell">
      <section className="profile-premium-hero profile-reveal">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="profile-cover-media"
            aria-hidden="true"
          />
        ) : (
          <div className="profile-cover-fallback" aria-hidden="true">
            <div className="profile-fallback-grid" />
            <div className="profile-fallback-glow profile-fallback-glow-a" />
            <div className="profile-fallback-glow profile-fallback-glow-b" />
          </div>
        )}

        <div className="profile-cover-shade" />
        <div className="profile-cover-noise" />
        <PremiumFallbackVisual />

        <div className="relative z-20 flex min-h-[430px] flex-col justify-end p-5 sm:p-8 lg:min-h-[500px] lg:p-10">
          <div className="max-w-3xl">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end">
              <div className="profile-avatar-wrap">
                <div className="profile-avatar">
                  <span>{initials}</span>
                </div>
                <span
                  className="absolute bottom-2 right-2 h-4 w-4 rounded-full border-[3px] border-[#10120f] bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,.65)]"
                  aria-hidden="true"
                />
              </div>

              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center gap-3">
                  <h1 className="text-4xl font-black tracking-[-0.055em] text-white sm:text-5xl lg:text-6xl">
                    {profile.name}
                  </h1>
                  {profile.emailVerified && (
                    <span
                      className="grid h-8 w-8 place-items-center rounded-full bg-sky-400 text-sm font-black text-slate-950 shadow-[0_8px_24px_rgba(56,189,248,.28)]"
                      title="Verified email"
                    >
                      ✓
                    </span>
                  )}
                </div>

                <p className="mt-2 text-sm font-semibold text-zinc-300 sm:text-base">
                  {publicRole} · 36 member
                </p>

                <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-bold text-zinc-200">
                  <span className="profile-glass-pill">
                    Member since {memberSinceLabel(profile.createdAt)}
                  </span>
                  <span className="profile-glass-pill">
                    {profile.emailVerified ? "Verified on 36" : "Verification pending"}
                  </span>
                  {coverStudio && (
                    <span className="profile-glass-pill">
                      Cover from {coverStudio.name}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:max-w-4xl lg:grid-cols-4">
            {[
              { value: profile.reviewCount, label: "Reviews", detail: isOwner ? "Verified guests" : "Verified activity" },
              { value: primaryStat, label: primaryStatLabel, detail: isOwner ? "Public listings" : "Completed bookings" },
              { value: ratingLabel, label: isOwner ? "Host rating" : "Reputation", detail: isOwner && profile.averageRating != null ? "Average score" : "On 36" },
              { value: years || "<1", label: years === 1 ? "Year on 36" : "Years on 36", detail: "Community history" },
            ].map((item, index) => (
              <div
                key={item.label}
                className="profile-stat-card profile-reveal"
                style={{ animationDelay: `${120 + index * 70}ms` }}
              >
                <strong>{item.value}</strong>
                <div>
                  <span>{item.label}</span>
                  <small>{item.detail}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <nav className="profile-tabbar profile-reveal" style={{ animationDelay: "180ms" }}>
        <a href="#about">Overview</a>
        {isOwner && <a href="#studios">Studios</a>}
        <a href="#reviews">Reviews</a>
        {isSelf && <a href="#account">Account</a>}
      </nav>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="space-y-6">
          <section
            id="about"
            className="profile-premium-panel profile-reveal scroll-mt-28"
            style={{ animationDelay: "220ms" }}
          >
            <div className="profile-section-heading">
              <div>
                <span className="profile-eyebrow">About</span>
                <h2>Creative identity</h2>
              </div>
              <span className="profile-section-mark">36</span>
            </div>

            <p className="mt-5 max-w-3xl text-sm leading-7 text-zinc-400 sm:text-[15px]">
              {isOwner
                ? profile.name +
                  " is a Studio Host on 36. This public profile brings together verified studio listings, completed sessions and marketplace reviews in one place."
                : profile.name +
                  " is a Creator on 36. This profile highlights verified booking activity and reviews connected to completed studio sessions."}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="profile-detail-tile">
                <span className="profile-detail-icon">✓</span>
                <div>
                  <b>{profile.emailVerified ? "Email verified" : "Verification pending"}</b>
                  <small>Identity signal</small>
                </div>
              </div>
              <div className="profile-detail-tile">
                <span className="profile-detail-icon">◷</span>
                <div>
                  <b>{profile.completedSessions} completed</b>
                  <small>Marketplace sessions</small>
                </div>
              </div>
              <div className="profile-detail-tile">
                <span className="profile-detail-icon">★</span>
                <div>
                  <b>{profile.reviewCount} reviews</b>
                  <small>Verified activity</small>
                </div>
              </div>
            </div>
          </section>

          {isOwner && (
            <section
              id="studios"
              className="profile-premium-panel profile-reveal scroll-mt-28"
              style={{ animationDelay: "260ms" }}
            >
              <div className="profile-section-heading">
                <div>
                  <span className="profile-eyebrow">Hosting</span>
                  <h2>{profile.name}&apos;s studios</h2>
                </div>
                {studios.length > 0 && (
                  <span className="text-xs font-bold text-zinc-500">
                    {studios.length} verified
                  </span>
                )}
              </div>

              {studios.length === 0 ? (
                <div className="profile-empty-state">
                  <StudioFallback />
                  <div className="relative z-10 p-6">
                    <b>No public studios yet</b>
                    <p>Verified listings will appear here automatically.</p>
                  </div>
                </div>
              ) : (
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                  {studios.map((studio, index) => (
                    <Link
                      key={studio.id}
                      href={"/studios/" + studio.slug}
                      className="profile-studio-card group"
                      style={{ animationDelay: `${300 + index * 55}ms` }}
                    >
                      <div className="relative aspect-[16/10] overflow-hidden bg-zinc-900">
                        {studio.photoUrl ? (
                          <img
                            src={studio.photoUrl}
                            alt={studio.name}
                            className="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.055]"
                          />
                        ) : (
                          <StudioFallback />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                        <span className="absolute right-3 top-3 rounded-full border border-white/15 bg-black/45 px-3 py-1.5 text-[10px] font-black text-white backdrop-blur-xl">
                          {studio.rating != null ? "★ " + studio.rating.toFixed(1) : "New"}
                        </span>
                      </div>

                      <div className="p-4 sm:p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0">
                            <b className="block truncate text-base text-white">
                              {studio.name}
                            </b>
                            <span className="mt-1 block text-[11px] text-zinc-500">
                              {studio.neighborhood || studio.city}
                              {studio.neighborhood ? ", " + studio.city : ""}
                            </span>
                          </div>
                          <span className="profile-card-arrow">↗</span>
                        </div>

                        <div className="mt-4 flex items-end justify-between gap-3 border-t border-white/[0.06] pt-4">
                          <p className="text-sm">
                            <b className="text-white">
                              {studio.priceMad ? studio.priceMad + " MAD" : "—"}
                            </b>
                            <span className="text-zinc-600"> / hour</span>
                          </p>
                          <span className="text-[10px] font-bold text-zinc-600">
                            {studio.reviewCount} review{studio.reviewCount === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}

          <section
            id="reviews"
            className="profile-premium-panel profile-reveal scroll-mt-28"
            style={{ animationDelay: "300ms" }}
          >
            <div className="profile-section-heading">
              <div>
                <span className="profile-eyebrow">Reviews</span>
                <h2>
                  {isOwner
                    ? "What creators say"
                    : "Reviews by " + profile.name}
                </h2>
              </div>
              <span className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[10px] font-bold text-zinc-500">
                Verified bookings only
              </span>
            </div>

            {reviews.length === 0 ? (
              <div className="mt-6 rounded-[1.4rem] border border-dashed border-white/[0.08] bg-black/15 p-8 text-sm text-zinc-600">
                No verified review activity yet.
              </div>
            ) : (
              <div className="mt-6 grid gap-4 md:grid-cols-2">
                {reviews.map((review) => (
                  <article key={review.id} className="profile-review-card">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-white/[0.08] bg-white/[0.05] text-xs font-black text-zinc-300">
                          {review.direction === "RECEIVED"
                            ? profileInitials(review.personName || "36")
                            : "36"}
                        </div>
                        <div className="min-w-0">
                          {review.direction === "RECEIVED" && review.personId ? (
                            <Link
                              href={"/profile/" + review.personId}
                              className="block truncate text-sm font-black text-white transition hover:text-acid"
                            >
                              {review.personName}
                            </Link>
                          ) : (
                            <b className="block truncate text-sm text-white">
                              {review.studioName}
                            </b>
                          )}
                          <p className="mt-0.5 text-[10px] text-zinc-600">
                            {new Intl.DateTimeFormat("en", {
                              month: "short",
                              year: "numeric",
                              timeZone: "UTC",
                            }).format(review.createdAt)}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 text-xs font-black text-amber-300">
                        ★ {review.rating}
                      </span>
                    </div>

                    {review.comment && (
                      <p className="mt-4 line-clamp-5 text-sm leading-6 text-zinc-400">
                        {review.comment}
                      </p>
                    )}

                    <Link
                      href={"/studios/" + review.studioSlug}
                      className="mt-5 inline-flex items-center gap-2 text-[10px] font-black text-zinc-500 transition hover:gap-3 hover:text-white"
                    >
                      {review.studioName} <span>→</span>
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          {isSelf && (
            <section
              id="account"
              className="profile-premium-panel profile-reveal scroll-mt-28"
              style={{ animationDelay: "340ms" }}
            >
              <div className="profile-section-heading">
                <div>
                  <span className="profile-eyebrow">Private</span>
                  <h2>Account details</h2>
                  <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-600">
                    Email and phone stay private. They are never exposed on your public profile.
                  </p>
                </div>
                {saved && (
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-400/[0.08] px-3 py-1.5 text-[10px] font-black text-emerald-300">
                    Saved
                  </span>
                )}
              </div>

              {error && (
                <div className="mt-5 rounded-2xl border border-red-400/15 bg-red-400/[0.05] p-4 text-xs text-red-300">
                  {error === "phone"
                    ? "Enter a valid phone number."
                    : "Enter a valid profile name."}
                </div>
              )}

              <form
                action={updateProfileAction}
                className="mt-6 grid gap-4 sm:grid-cols-2"
              >
                <label>
                  <span className="label">Display name</span>
                  <input
                    className="field"
                    name="name"
                    defaultValue={profile.name}
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </label>

                <label>
                  <span className="label">Phone</span>
                  <input
                    className="field"
                    name="phone"
                    defaultValue={phone || ""}
                    maxLength={40}
                    placeholder="+212…"
                  />
                </label>

                <label className="sm:col-span-2">
                  <span className="label">Email</span>
                  <input
                    className="field opacity-70"
                    value={email || ""}
                    readOnly
                    aria-readonly="true"
                  />
                </label>

                <div className="sm:col-span-2">
                  <button className="profile-primary-button">Save profile</button>
                </div>
              </form>
            </section>
          )}
        </div>

        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <section
            className="profile-side-card profile-reveal"
            style={{ animationDelay: "260ms" }}
          >
            <div className="profile-trust-crown">♛</div>
            <span className="profile-eyebrow">36 identity</span>
            <h3 className="mt-2 text-xl font-black tracking-[-0.03em] text-white">
              {isOwner ? "Trusted host profile" : "Verified creator profile"}
            </h3>
            <p className="mt-3 text-xs leading-6 text-zinc-500">
              Activity shown here is connected to real marketplace actions on 36.
            </p>

            <div className="mt-5 space-y-3">
              <div className="profile-side-row">
                <span>Identity</span>
                <b>{profile.emailVerified ? "Verified" : "Pending"}</b>
              </div>
              <div className="profile-side-row">
                <span>Member</span>
                <b>{memberSinceLabel(profile.createdAt)}</b>
              </div>
              <div className="profile-side-row">
                <span>Activity</span>
                <b>{profile.completedSessions} sessions</b>
              </div>
            </div>
          </section>

          <section
            className="profile-side-card profile-side-card-visual profile-reveal"
            style={{ animationDelay: "320ms" }}
          >
            <div className="profile-network-orb" aria-hidden="true">
              <div className="profile-network-core">36</div>
              <span className="profile-network-ring profile-network-ring-a" />
              <span className="profile-network-ring profile-network-ring-b" />
              <i className="profile-network-dot profile-network-dot-a" />
              <i className="profile-network-dot profile-network-dot-b" />
              <i className="profile-network-dot profile-network-dot-c" />
            </div>
            <div className="relative z-10 mt-3">
              <span className="profile-eyebrow">Creative network</span>
              <h3 className="mt-2 text-lg font-black text-white">
                Create. Connect. Belong.
              </h3>
              <p className="mt-2 text-xs leading-5 text-zinc-500">
                Your profile becomes your identity across bookings, studios and reviews.
              </p>
            </div>
          </section>

          {isSelf && (
            <Link href={"/profile/" + profile.id} className="profile-public-button">
              <span>
                <small>Preview</small>
                View public profile
              </span>
              <b>↗</b>
            </Link>
          )}
        </aside>
      </div>
    </div>
  );
}
