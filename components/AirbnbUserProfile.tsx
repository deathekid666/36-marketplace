import Link from "next/link";
import type { UserRole } from "@prisma/client";

import { updateProfileAction } from "@/app/profile/actions";
import { ProfileAmbient3D } from "@/components/ProfileAmbient3D";
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

function Icon({
  name,
  className = "",
}: {
  name: "star" | "studio" | "calendar" | "clock" | "check" | "shield" | "arrow" | "user";
  className?: string;
}) {
  const common = {
    className,
    width: 20,
    height: 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "star")
    return <svg {...common}><path d="m12 3 2.7 5.47 6.03.88-4.36 4.25 1.03 6-5.4-2.84L6.6 19.6l1.03-6-4.36-4.25 6.03-.88L12 3Z" /></svg>;
  if (name === "studio")
    return <svg {...common}><path d="M4 21V6.5L12 3l8 3.5V21" /><path d="M8 10h2M14 10h2M8 14h2M14 14h2M7 21v-3h10v3" /></svg>;
  if (name === "calendar")
    return <svg {...common}><path d="M5 4v3M19 4v3M4 9h16M5 6h14a1 1 0 0 1 1 1v13H4V7a1 1 0 0 1 1-1Z" /><path d="m9 14 2 2 4-4" /></svg>;
  if (name === "clock")
    return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.2 2" /></svg>;
  if (name === "check")
    return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="m8.3 12.1 2.4 2.4 5-5" /></svg>;
  if (name === "shield")
    return <svg {...common}><path d="M12 3 5.5 5.5v5.3c0 4.3 2.7 7.7 6.5 9.2 3.8-1.5 6.5-4.9 6.5-9.2V5.5L12 3Z" /><path d="m9 11.6 2 2 4-4" /></svg>;
  if (name === "arrow")
    return <svg {...common}><path d="M5 12h13M14 7l5 5-5 5" /></svg>;
  return <svg {...common}><circle cx="12" cy="8" r="3.5" /><path d="M5.5 20c.6-4.1 3-6 6.5-6s5.9 1.9 6.5 6" /></svg>;
}

function CoverFallback() {
  return (
    <div className="lux-profile-cover-fallback" aria-hidden="true">
      <div className="lux-profile-fallback-sky" />
      <div className="lux-profile-fallback-grid" />
      <div className="lux-profile-fallback-arch lux-profile-fallback-arch-a" />
      <div className="lux-profile-fallback-arch lux-profile-fallback-arch-b" />
      <div className="lux-profile-fallback-floor" />
    </div>
  );
}

function StudioFallback() {
  return (
    <div className="lux-profile-studio-fallback" aria-hidden="true">
      <span>36</span>
      <i />
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

  const stats = [
    {
      icon: "star" as const,
      value: profile.reviewCount,
      label: "Reviews",
      hint: "Verified activity",
    },
    {
      icon: isOwner ? ("studio" as const) : ("calendar" as const),
      value: isOwner ? studios.length : profile.completedSessions,
      label: isOwner ? "Studios" : "Sessions",
      hint: isOwner ? "Public listings" : "Completed bookings",
    },
    {
      icon: "shield" as const,
      value: profile.averageRating != null ? profile.averageRating.toFixed(1) : "New",
      label: isOwner ? "Host rating" : "Reputation",
      hint: profile.averageRating != null ? "Marketplace average" : "Building history",
    },
    {
      icon: "clock" as const,
      value: years || "<1",
      label: years === 1 ? "Year on 36" : "Years on 36",
      hint: "Community history",
    },
  ];

  return (
    <div className="lux-profile-shell">
      <section className="lux-profile-hero">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="lux-profile-cover-image" aria-hidden="true" />
        ) : (
          <CoverFallback />
        )}
        <div className="lux-profile-cover-overlay" />
        <div className="lux-profile-cover-vignette" />

        <div className="lux-profile-hero-copy">
          <div className="lux-profile-kicker">
            <span className="lux-profile-kicker-dot" />
            {isOwner ? "Studio host profile" : "Creator profile"}
          </div>

          <div className="lux-profile-identity-row">
            <div className="lux-profile-avatar-wrap">
              <div className="lux-profile-avatar">{initials}</div>
              {profile.emailVerified && (
                <span className="lux-profile-avatar-badge" title="Verified">
                  <Icon name="check" className="h-3.5 w-3.5" />
                </span>
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1>{profile.name}</h1>
                {profile.emailVerified && (
                  <span className="lux-profile-verified-pill">
                    <Icon name="check" className="h-3.5 w-3.5" />
                    Verified
                  </span>
                )}
              </div>
              <p className="lux-profile-role">{publicRole}</p>
              <div className="lux-profile-hero-meta">
                <span>Member since {memberSinceLabel(profile.createdAt)}</span>
                {coverStudio && <span>{coverStudio.name}</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="lux-profile-hero-art">
          <ProfileAmbient3D />
        </div>

        <div className="lux-profile-stat-dock">
          {stats.map((stat) => (
            <div key={stat.label} className="lux-profile-stat">
              <span className="lux-profile-stat-icon">
                <Icon name={stat.icon} />
              </span>
              <div>
                <b>{stat.value}</b>
                <span>{stat.label}</span>
                <small>{stat.hint}</small>
              </div>
            </div>
          ))}
        </div>
      </section>

      <nav className="lux-profile-tabs">
        <a href="#overview" className="lux-profile-tab-active">Overview</a>
        {isOwner && <a href="#studios">Studios</a>}
        <a href="#reviews">Reviews</a>
        {isSelf && <a href="#account">Account</a>}
      </nav>

      <section className="lux-profile-body" id="overview">
        <aside className="lux-profile-sidebar">
          <section className="lux-profile-card lux-profile-about">
            <div className="lux-profile-card-label">About</div>
            <h2>{profile.name}</h2>
            <p>
              {isOwner
                ? "Studio Host on 36 with public activity based on verified listings, completed sessions and marketplace reviews."
                : "Creator on 36 with public activity based on completed studio sessions and verified marketplace reviews."}
            </p>

            <div className="lux-profile-chip-row">
              <span>{publicRole}</span>
              {isOwner && <span>{studios.length} studio{studios.length === 1 ? "" : "s"}</span>}
              <span>{profile.completedSessions} sessions</span>
            </div>

            <div className="lux-profile-fact-list">
              <div>
                <span className="lux-profile-fact-icon"><Icon name="shield" /></span>
                <div>
                  <b>{profile.emailVerified ? "Verified identity" : "Verification pending"}</b>
                  <small>{profile.emailVerified ? "Email confirmed on 36" : "Email not yet confirmed"}</small>
                </div>
              </div>
              <div>
                <span className="lux-profile-fact-icon"><Icon name="clock" /></span>
                <div>
                  <b>Member since</b>
                  <small>{memberSinceLabel(profile.createdAt)}</small>
                </div>
              </div>
            </div>
          </section>

          {isSelf && (
            <Link href={"/profile/" + profile.id} className="lux-profile-public-preview">
              <span>
                <small>Public view</small>
                See how others see you
              </span>
              <Icon name="arrow" />
            </Link>
          )}
        </aside>

        <div className="lux-profile-main">
          {isOwner && (
            <section id="studios" className="lux-profile-card lux-profile-section">
              <div className="lux-profile-section-head">
                <div>
                  <div className="lux-profile-card-label">Spaces</div>
                  <h2>Studios <span>{studios.length}</span></h2>
                </div>
                {studios.length > 0 && <small>Verified listings</small>}
              </div>

              {studios.length === 0 ? (
                <div className="lux-profile-empty">
                  <span className="lux-profile-empty-icon"><Icon name="studio" /></span>
                  <div>
                    <b>No public studios yet</b>
                    <p>Verified listings will appear here automatically.</p>
                  </div>
                </div>
              ) : (
                <div className="lux-profile-studio-grid">
                  {studios.slice(0, 6).map((studio) => (
                    <Link key={studio.id} href={"/studios/" + studio.slug} className="lux-profile-studio-card group">
                      <div className="lux-profile-studio-media">
                        {studio.photoUrl ? (
                          <img src={studio.photoUrl} alt={studio.name} />
                        ) : (
                          <StudioFallback />
                        )}
                        <div className="lux-profile-studio-shade" />
                        <span className="lux-profile-studio-rating">
                          {studio.rating != null ? "★ " + studio.rating.toFixed(1) : "New"}
                        </span>
                      </div>
                      <div className="lux-profile-studio-info">
                        <div className="min-w-0">
                          <b className="truncate">{studio.name}</b>
                          <p>{studio.neighborhood || studio.city}{studio.neighborhood ? ", " + studio.city : ""}</p>
                        </div>
                        <span className="lux-profile-studio-arrow"><Icon name="arrow" /></span>
                      </div>
                      <div className="lux-profile-studio-footer">
                        <span><b>{studio.priceMad ? studio.priceMad + " MAD" : "—"}</b> / hour</span>
                        <small>{studio.reviewCount} review{studio.reviewCount === 1 ? "" : "s"}</small>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}

          <section id="reviews" className="lux-profile-card lux-profile-section">
            <div className="lux-profile-section-head">
              <div>
                <div className="lux-profile-card-label">Community</div>
                <h2>{isOwner ? "Recent reviews" : "Review activity"} <span>{reviews.length}</span></h2>
              </div>
              <small>Completed bookings only</small>
            </div>

            {reviews.length === 0 ? (
              <div className="lux-profile-empty">
                <span className="lux-profile-empty-icon"><Icon name="star" /></span>
                <div>
                  <b>No reviews yet</b>
                  <p>Verified review activity will appear here.</p>
                </div>
              </div>
            ) : (
              <div className="lux-profile-review-grid">
                {reviews.slice(0, 6).map((review) => (
                  <article key={review.id} className="lux-profile-review">
                    <div className="lux-profile-review-top">
                      <div className="lux-profile-review-person">
                        <span className="lux-profile-review-avatar">
                          {review.direction === "RECEIVED" ? profileInitials(review.personName || "36") : "36"}
                        </span>
                        <div>
                          {review.direction === "RECEIVED" && review.personId ? (
                            <Link href={"/profile/" + review.personId}>{review.personName}</Link>
                          ) : (
                            <b>{review.studioName}</b>
                          )}
                          <small>
                            {new Intl.DateTimeFormat("en", {
                              month: "short",
                              year: "numeric",
                              timeZone: "UTC",
                            }).format(review.createdAt)}
                          </small>
                        </div>
                      </div>
                      <span className="lux-profile-review-score">★ {review.rating}</span>
                    </div>

                    {review.comment && <p>{review.comment}</p>}

                    <Link href={"/studios/" + review.studioSlug} className="lux-profile-review-link">
                      {review.studioName}
                      <Icon name="arrow" />
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          {isSelf && (
            <section id="account" className="lux-profile-card lux-profile-section">
              <div className="lux-profile-section-head">
                <div>
                  <div className="lux-profile-card-label">Private</div>
                  <h2>Account details</h2>
                </div>
                {saved && <span className="lux-profile-saved">Saved</span>}
              </div>
              <p className="lux-profile-account-note">
                Email and phone are private and are never shown on your public profile.
              </p>

              {error && (
                <div className="lux-profile-error">
                  {error === "phone" ? "Enter a valid phone number." : "Enter a valid profile name."}
                </div>
              )}

              <form action={updateProfileAction} className="lux-profile-form">
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
                  <button>Save changes</button>
                </div>
              </form>
            </section>
          )}
        </div>

        <aside className="lux-profile-right">
          <section className="lux-profile-trust-card">
            <div className="lux-profile-trust-top">
              <span className="lux-profile-trust-icon"><Icon name="shield" /></span>
              <div>
                <small>36 trust</small>
                <h3>{isOwner ? "Host profile" : "Creator profile"}</h3>
              </div>
            </div>
            <p>
              Marketplace signals shown here come from real account and booking activity.
            </p>
            <div className="lux-profile-trust-lines">
              <div><span>Identity</span><b>{profile.emailVerified ? "Verified" : "Pending"}</b></div>
              <div><span>Sessions</span><b>{profile.completedSessions}</b></div>
              <div><span>Reviews</span><b>{profile.reviewCount}</b></div>
            </div>
          </section>

          <section className="lux-profile-network-card">
            <ProfileAmbient3D />
            <div className="lux-profile-network-copy">
              <small>Creative network</small>
              <h3>One identity across 36.</h3>
              <p>Studios, sessions and reviews connect back to this profile.</p>
            </div>
          </section>
        </aside>
      </section>
    </div>
  );
}
