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

function ProfileNav({ role }: { role: UserRole }) {
  return (
    <aside className="ref-profile-nav">
      <div className="ref-profile-nav-inner">
        <Link href="/profile" className="ref-profile-nav-item ref-profile-nav-item-active">
          <span>⌂</span><b>Profile</b>
        </Link>
        {role !== "ADMIN" && (
          <Link href="/bookings" className="ref-profile-nav-item">
            <span>▣</span><b>Bookings</b>
          </Link>
        )}
        {role === "CREATOR" && (
          <Link href="/favorites" className="ref-profile-nav-item">
            <span>♡</span><b>Favorites</b>
          </Link>
        )}
        <a href="#reviews" className="ref-profile-nav-item">
          <span>☆</span><b>Reviews</b>
        </a>
        <a href="#account" className="ref-profile-nav-item">
          <span>⚙</span><b>Settings</b>
        </a>
      </div>
    </aside>
  );
}

function CoverFallback() {
  return (
    <div className="ref-profile-cover-fallback" aria-hidden="true">
      <div className="ref-profile-cover-grid" />
      <div className="ref-profile-cover-orb ref-profile-cover-orb-a" />
      <div className="ref-profile-cover-orb ref-profile-cover-orb-b" />
      <div className="ref-profile-cover-horizon" />
    </div>
  );
}

function NetworkGlobe() {
  return (
    <div className="ref-profile-globe" aria-hidden="true">
      <div className="ref-profile-globe-core">36</div>
      <span className="ref-profile-globe-ring ref-profile-globe-ring-a" />
      <span className="ref-profile-globe-ring ref-profile-globe-ring-b" />
      <span className="ref-profile-globe-ring ref-profile-globe-ring-c" />
      <i className="ref-profile-globe-dot ref-profile-globe-dot-a" />
      <i className="ref-profile-globe-dot ref-profile-globe-dot-b" />
      <i className="ref-profile-globe-dot ref-profile-globe-dot-c" />
    </div>
  );
}

function StudioFallback() {
  return (
    <div className="ref-profile-studio-fallback">
      <div className="ref-profile-studio-fallback-grid" />
      <span>36</span>
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
  const primaryValue = isOwner ? studios.length : profile.completedSessions;
  const primaryLabel = isOwner ? "Studios listed" : "Completed sessions";

  return (
    <div className="ref-profile-shell">
      <div className={isSelf ? "ref-profile-top-grid" : "ref-profile-top-grid ref-profile-top-grid-public"}>
        {isSelf && <ProfileNav role={profile.role} />}

        <section className="ref-profile-hero">
          {coverUrl ? (
            <img src={coverUrl} alt="" className="ref-profile-cover-image" aria-hidden="true" />
          ) : (
            <CoverFallback />
          )}
          <div className="ref-profile-cover-overlay" />

          <div className="ref-profile-hero-content">
            <div className="ref-profile-person">
              <div className="ref-profile-avatar-wrap">
                <div className="ref-profile-avatar">{initials}</div>
                <span className="ref-profile-online-dot" aria-hidden="true" />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h1>{profile.name}</h1>
                  {profile.emailVerified && <span className="ref-profile-verified" title="Verified">✓</span>}
                </div>
                <p className="ref-profile-role">{publicRole}</p>
                <div className="ref-profile-meta">
                  <span>Member since {memberSinceLabel(profile.createdAt)}</span>
                  {profile.emailVerified && <span>Verified on 36</span>}
                  {coverStudio && <span>Cover: {coverStudio.name}</span>}
                </div>
              </div>
            </div>

            <div className="ref-profile-stats">
              <div className="ref-profile-stat">
                <span className="ref-profile-stat-icon">☆</span>
                <div><b>{profile.reviewCount}</b><span>Reviews</span><small>Verified activity</small></div>
              </div>
              <div className="ref-profile-stat">
                <span className="ref-profile-stat-icon">◫</span>
                <div><b>{primaryValue}</b><span>{primaryLabel}</span><small>{isOwner ? "Public listings" : "Marketplace activity"}</small></div>
              </div>
              <div className="ref-profile-stat">
                <span className="ref-profile-stat-icon">★</span>
                <div><b>{profile.averageRating != null ? profile.averageRating.toFixed(1) : "New"}</b><span>{isOwner ? "Host rating" : "Reputation"}</span><small>{isOwner && profile.averageRating != null ? "Average score" : "On 36"}</small></div>
              </div>
              <div className="ref-profile-stat">
                <span className="ref-profile-stat-icon">◷</span>
                <div><b>{years || "<1"}</b><span>{years === 1 ? "Year on 36" : "Years on 36"}</span><small>Community history</small></div>
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="ref-profile-light">
        <nav className="ref-profile-tabs">
          <a href="#overview" className="ref-profile-tab-active">Overview</a>
          {isOwner && <a href="#studios">Studios</a>}
          <a href="#reviews">Reviews</a>
          {isSelf && <a href="#account">Account</a>}
        </nav>

        <div className="ref-profile-dashboard" id="overview">
          <aside className="ref-profile-about-card">
            <h2>About</h2>
            <p>
              {isOwner
                ? profile.name + " is a Studio Host on 36. Their public activity is based on verified studio listings, completed sessions and marketplace reviews."
                : profile.name + " is a " + publicRole + " on 36. Their public activity is based on completed sessions and verified marketplace reviews."}
            </p>

            <div className="ref-profile-about-chips">
              <span>{publicRole}</span>
              <span>{profile.completedSessions} sessions</span>
              {isOwner && <span>{studios.length} studio{studios.length === 1 ? "" : "s"}</span>}
            </div>

            <div className="ref-profile-facts">
              <div><span>●</span><b>{profile.emailVerified ? "Email verified" : "Verification pending"}</b></div>
              <div><span>◷</span><b>Member since</b><em>{memberSinceLabel(profile.createdAt)}</em></div>
              <div><span>☆</span><b>Reviews</b><em>{profile.reviewCount}</em></div>
            </div>
          </aside>

          <div className="ref-profile-center">
            {isOwner && (
              <section id="studios" className="ref-profile-content-card">
                <div className="ref-profile-section-title">
                  <div>
                    <span>Hosting</span>
                    <h2>Studios <small>({studios.length})</small></h2>
                  </div>
                  {studios.length > 0 && <span className="ref-profile-muted-link">Verified listings</span>}
                </div>

                {studios.length === 0 ? (
                  <div className="ref-profile-empty">No public verified studios yet.</div>
                ) : (
                  <div className="ref-profile-studio-grid">
                    {studios.map((studio) => (
                      <Link key={studio.id} href={"/studios/" + studio.slug} className="ref-profile-studio-card group">
                        <div className="ref-profile-studio-media">
                          {studio.photoUrl ? (
                            <img src={studio.photoUrl} alt={studio.name} />
                          ) : (
                            <StudioFallback />
                          )}
                          <span className="ref-profile-heart">♡</span>
                        </div>
                        <div className="ref-profile-studio-copy">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <b className="truncate">{studio.name}</b>
                              <p>{studio.neighborhood || studio.city}{studio.neighborhood ? ", " + studio.city : ""}</p>
                            </div>
                            <span className="ref-profile-rating">{studio.rating != null ? "★ " + studio.rating.toFixed(1) : "New"}</span>
                          </div>
                          <div className="ref-profile-studio-price">
                            <span><b>{studio.priceMad ? studio.priceMad + " MAD" : "—"}</b> / hour</span>
                            <i>→</i>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section id="reviews" className="ref-profile-content-card">
              <div className="ref-profile-section-title">
                <div>
                  <span>Community</span>
                  <h2>{isOwner ? "Recent reviews" : "Review activity"} <small>({reviews.length})</small></h2>
                </div>
                <span className="ref-profile-muted-link">Verified bookings only</span>
              </div>

              {reviews.length === 0 ? (
                <div className="ref-profile-empty">No verified review activity yet.</div>
              ) : (
                <div className="ref-profile-review-list">
                  {reviews.slice(0, 6).map((review) => (
                    <article key={review.id} className="ref-profile-review">
                      <div className="ref-profile-review-avatar">
                        {review.direction === "RECEIVED" ? profileInitials(review.personName || "36") : "36"}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="ref-profile-review-head">
                          <div>
                            {review.direction === "RECEIVED" && review.personId ? (
                              <Link href={"/profile/" + review.personId}>{review.personName}</Link>
                            ) : (
                              <b>{review.studioName}</b>
                            )}
                            <span>{new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(review.createdAt)}</span>
                          </div>
                          <strong>{"★".repeat(Math.max(1, Math.min(5, review.rating)))}</strong>
                        </div>
                        {review.comment && <p>{review.comment}</p>}
                        <Link className="ref-profile-review-link" href={"/studios/" + review.studioSlug}>{review.studioName} →</Link>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>

            {isSelf && (
              <section id="account" className="ref-profile-content-card">
                <div className="ref-profile-section-title">
                  <div>
                    <span>Private</span>
                    <h2>Account details</h2>
                  </div>
                  {saved && <span className="ref-profile-saved">Saved</span>}
                </div>
                <p className="ref-profile-private-note">Your email and phone stay private and are not shown on your public profile.</p>

                {error && (
                  <div className="ref-profile-error">{error === "phone" ? "Enter a valid phone number." : "Enter a valid profile name."}</div>
                )}

                <form action={updateProfileAction} className="ref-profile-form">
                  <label>
                    <span>Display name</span>
                    <input name="name" defaultValue={profile.name} minLength={2} maxLength={100} required />
                  </label>
                  <label>
                    <span>Phone</span>
                    <input name="phone" defaultValue={phone || ""} maxLength={40} placeholder="+212…" />
                  </label>
                  <label className="sm:col-span-2">
                    <span>Email</span>
                    <input value={email || ""} readOnly aria-readonly="true" />
                  </label>
                  <div className="sm:col-span-2">
                    <button>Save profile</button>
                  </div>
                </form>
              </section>
            )}
          </div>

          <aside className="ref-profile-right-rail">
            <div className="ref-profile-badge-card">
              <div className="ref-profile-crown">♛</div>
              <div>
                <b>{isOwner ? "Studio Host" : "Verified member"}</b>
                <span>{profile.emailVerified ? "Identity verified on 36" : "Verification pending"}</span>
              </div>
            </div>

            <NetworkGlobe />

            <div className="ref-profile-rail-tile">
              <span className="ref-profile-rail-icon ref-profile-rail-blue">◉</span>
              <div><b>Creative spaces</b><small>{isOwner ? "Studios connected to this profile" : "Built for creators"}</small></div>
            </div>
            <div className="ref-profile-rail-tile">
              <span className="ref-profile-rail-icon ref-profile-rail-green">✓</span>
              <div><b>Verified reviews</b><small>Completed bookings only</small></div>
            </div>
            <div className="ref-profile-rail-tile">
              <span className="ref-profile-rail-icon ref-profile-rail-purple">◎</span>
              <div><b>36 identity</b><small>One profile across the marketplace</small></div>
            </div>

            {isSelf && (
              <Link href={"/profile/" + profile.id} className="ref-profile-public-link">
                View public profile <span>↗</span>
              </Link>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
