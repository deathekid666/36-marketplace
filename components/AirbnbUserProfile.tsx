import Link from "next/link";
import type { UserRole } from "@prisma/client";

import { updateProfileAction } from "@/app/profile/actions";
import { ProfileImageUploader } from "@/components/ProfileImageUploader";
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
  name:
    | "star"
    | "studio"
    | "calendar"
    | "clock"
    | "check"
    | "shield"
    | "arrow"
    | "user"
    | "edit";
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
    return (
      <svg {...common}>
        <path d="m12 3 2.7 5.47 6.03.88-4.36 4.25 1.03 6-5.4-2.84L6.6 19.6l1.03-6-4.36-4.25 6.03-.88L12 3Z" />
      </svg>
    );
  if (name === "studio")
    return (
      <svg {...common}>
        <path d="M4 21V6.5L12 3l8 3.5V21" />
        <path d="M8 10h2M14 10h2M8 14h2M14 14h2M7 21v-3h10v3" />
      </svg>
    );
  if (name === "calendar")
    return (
      <svg {...common}>
        <path d="M5 4v3M19 4v3M4 9h16M5 6h14a1 1 0 0 1 1 1v13H4V7a1 1 0 0 1 1-1Z" />
        <path d="m9 14 2 2 4-4" />
      </svg>
    );
  if (name === "clock")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="8.5" />
        <path d="M12 7v5l3.2 2" />
      </svg>
    );
  if (name === "check")
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.3 12.1 2.4 2.4 5-5" />
      </svg>
    );
  if (name === "shield")
    return (
      <svg {...common}>
        <path d="M12 3 5.5 5.5v5.3c0 4.3 2.7 7.7 6.5 9.2 3.8-1.5 6.5-4.9 6.5-9.2V5.5L12 3Z" />
        <path d="m9 11.6 2 2 4-4" />
      </svg>
    );
  if (name === "arrow")
    return (
      <svg {...common}>
        <path d="M5 12h13M14 7l5 5-5 5" />
      </svg>
    );
  if (name === "edit")
    return (
      <svg {...common}>
        <path d="m4 16.5-.7 4.2 4.2-.7L18 9.5 14.5 6 4 16.5Z" />
        <path d="m13.8 6.7 3.5 3.5" />
      </svg>
    );
  return (
    <svg {...common}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 20c.6-4.1 3-6 6.5-6s5.9 1.9 6.5 6" />
    </svg>
  );
}

function CoverFallback() {
  return (
    <div className="air-profile-cover-fallback" aria-hidden="true">
      <div className="air-profile-cover-grid" />
      <div className="air-profile-cover-ring air-profile-cover-ring-a" />
      <div className="air-profile-cover-ring air-profile-cover-ring-b" />
      <div className="air-profile-cover-brand">
        <span>36</span>
        <small>creative spaces</small>
      </div>
    </div>
  );
}

function StudioFallback() {
  return (
    <div className="air-profile-studio-fallback" aria-hidden="true">
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
    avatarUrl: string | null;
    coverUrl: string | null;
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
  const coverUrl = profile.coverUrl || coverStudio?.photoUrl || null;
  const usingStudioCover = !profile.coverUrl && Boolean(coverStudio?.photoUrl);

  const stats = [
    {
      icon: "star" as const,
      value: profile.reviewCount,
      label: "Reviews",
    },
    {
      icon: isOwner ? ("studio" as const) : ("calendar" as const),
      value: isOwner ? studios.length : profile.completedSessions,
      label: isOwner ? "Studios" : "Sessions",
    },
    {
      icon: "shield" as const,
      value: profile.averageRating != null ? profile.averageRating.toFixed(1) : "New",
      label: isOwner ? "Rating" : "Reputation",
    },
    {
      icon: "clock" as const,
      value: years || "<1",
      label: years === 1 ? "Year on 36" : "Years on 36",
    },
  ];

  return (
    <div className="air-profile-page">
      <section className="air-profile-cover">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt=""
            className="air-profile-cover-image"
            aria-hidden="true"
          />
        ) : (
          <CoverFallback />
        )}
        <div className="air-profile-cover-shade" />
        {usingStudioCover && coverStudio && (
          <span className="air-profile-cover-source">
            Cover from {coverStudio.name}
          </span>
        )}
        {isSelf && (
          <div className="air-profile-cover-edit">
            <ProfileImageUploader kind="cover" />
          </div>
        )}
      </section>

      <section className="air-profile-summary">
        <div className="air-profile-avatar-wrap">
          <div className="air-profile-avatar">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt={profile.name} />
            ) : (
              initials
            )}
          </div>
          {profile.emailVerified && (
            <span className="air-profile-avatar-check" title="Verified">
              <Icon name="check" className="h-4 w-4" />
            </span>
          )}
          {isSelf && (
            <div className="air-profile-avatar-edit">
              <ProfileImageUploader kind="avatar" compact iconOnly />
            </div>
          )}
        </div>

        <div className="air-profile-summary-copy">
          <div className="air-profile-name-row">
            <h1>{profile.name}</h1>
            {profile.emailVerified && (
              <span className="air-profile-verified">
                <Icon name="check" className="h-3.5 w-3.5" />
                Verified
              </span>
            )}
          </div>
          <p>
            {publicRole}
            <span>·</span>
            Member since {memberSinceLabel(profile.createdAt)}
          </p>
        </div>

        {isSelf && (
          <div className="air-profile-summary-actions">
            <a href="#account" className="air-profile-edit-button">
              <Icon name="edit" className="h-4 w-4" />
              Edit profile
            </a>
            <Link
              href={"/profile/" + profile.id}
              className="air-profile-public-button"
            >
              View public profile
              <Icon name="arrow" className="h-4 w-4" />
            </Link>
          </div>
        )}
      </section>

      <section className="air-profile-stat-row">
        {stats.map((stat) => (
          <div key={stat.label} className="air-profile-stat-card">
            <span className="air-profile-stat-icon">
              <Icon name={stat.icon} />
            </span>
            <div>
              <b>{stat.value}</b>
              <span>{stat.label}</span>
            </div>
          </div>
        ))}
      </section>

      <nav className="air-profile-tabs-new">
        <a href="#about">About</a>
        {isOwner && <a href="#studios">Studios</a>}
        <a href="#reviews">Reviews</a>
        {isSelf && <a href="#account">Account</a>}
      </nav>

      <div className="air-profile-layout">
        <main className="air-profile-main-column">
          <section id="about" className="air-profile-section-card">
            <div className="air-profile-section-head">
              <div>
                <span>About</span>
                <h2>{profile.name}</h2>
              </div>
            </div>

            <p className="air-profile-about-copy">
              {isOwner
                ? "Studio Host on 36. This public profile brings together verified studio listings, completed sessions and marketplace reviews."
                : "Creator on 36. This profile shows verified booking activity and reviews connected to completed studio sessions."}
            </p>

            <div className="air-profile-info-grid">
              <div>
                <span className="air-profile-info-icon">
                  <Icon name="shield" />
                </span>
                <div>
                  <b>
                    {profile.emailVerified
                      ? "Identity verified"
                      : "Verification pending"}
                  </b>
                  <small>
                    {profile.emailVerified
                      ? "Email confirmed on 36"
                      : "Email verification not completed"}
                  </small>
                </div>
              </div>

              <div>
                <span className="air-profile-info-icon">
                  <Icon name="calendar" />
                </span>
                <div>
                  <b>{profile.completedSessions} completed sessions</b>
                  <small>Verified marketplace activity</small>
                </div>
              </div>
            </div>
          </section>

          {isOwner && (
            <section id="studios" className="air-profile-section-card">
              <div className="air-profile-section-head">
                <div>
                  <span>Spaces</span>
                  <h2>
                    Studios <small>{studios.length}</small>
                  </h2>
                </div>
                {studios.length > 0 && <em>Verified listings</em>}
              </div>

              {studios.length === 0 ? (
                <div className="air-profile-empty">
                  <span>
                    <Icon name="studio" />
                  </span>
                  <div>
                    <b>No public studios yet</b>
                    <p>Verified listings will appear here automatically.</p>
                  </div>
                </div>
              ) : (
                <div className="air-profile-studio-grid">
                  {studios.slice(0, 6).map((studio) => (
                    <Link
                      key={studio.id}
                      href={"/studios/" + studio.slug}
                      className="air-profile-studio-card"
                    >
                      <div className="air-profile-studio-media">
                        {studio.photoUrl ? (
                          <img src={studio.photoUrl} alt={studio.name} />
                        ) : (
                          <StudioFallback />
                        )}
                        <span className="air-profile-studio-rating">
                          {studio.rating != null
                            ? "★ " + studio.rating.toFixed(1)
                            : "New"}
                        </span>
                      </div>

                      <div className="air-profile-studio-title">
                        <div>
                          <b>{studio.name}</b>
                          <p>
                            {studio.neighborhood || studio.city}
                            {studio.neighborhood ? ", " + studio.city : ""}
                          </p>
                        </div>
                        <span>
                          <Icon name="arrow" />
                        </span>
                      </div>

                      <div className="air-profile-studio-meta">
                        <span>
                          <b>
                            {studio.priceMad
                              ? studio.priceMad + " MAD"
                              : "—"}
                          </b>{" "}
                          / hour
                        </span>
                        <small>
                          {studio.reviewCount} review
                          {studio.reviewCount === 1 ? "" : "s"}
                        </small>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          )}

          <section id="reviews" className="air-profile-section-card">
            <div className="air-profile-section-head">
              <div>
                <span>Community</span>
                <h2>
                  {isOwner ? "Recent reviews" : "Review activity"}{" "}
                  <small>{reviews.length}</small>
                </h2>
              </div>
              <em>Completed bookings only</em>
            </div>

            {reviews.length === 0 ? (
              <div className="air-profile-empty">
                <span>
                  <Icon name="star" />
                </span>
                <div>
                  <b>No reviews yet</b>
                  <p>Verified review activity will appear here.</p>
                </div>
              </div>
            ) : (
              <div className="air-profile-review-list">
                {reviews.slice(0, 6).map((review) => (
                  <article key={review.id} className="air-profile-review-card">
                    <div className="air-profile-review-top">
                      <div className="air-profile-review-person">
                        <span className="air-profile-review-avatar">
                          {review.direction === "RECEIVED"
                            ? profileInitials(review.personName || "36")
                            : "36"}
                        </span>
                        <div>
                          {review.direction === "RECEIVED" &&
                          review.personId ? (
                            <Link href={"/profile/" + review.personId}>
                              {review.personName}
                            </Link>
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

                      <span className="air-profile-review-score">
                        ★ {review.rating}
                      </span>
                    </div>

                    {review.comment && <p>{review.comment}</p>}

                    <Link
                      href={"/studios/" + review.studioSlug}
                      className="air-profile-review-link"
                    >
                      {review.studioName}
                      <Icon name="arrow" />
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          {isSelf && (
            <section id="account" className="air-profile-section-card">
              <div className="air-profile-section-head">
                <div>
                  <span>Private</span>
                  <h2>Account details</h2>
                </div>
                {saved && <strong className="air-profile-saved">Saved</strong>}
              </div>

              <p className="air-profile-private-note">
                Your email and phone stay private and are never shown on your
                public profile.
              </p>

              {error && (
                <div className="air-profile-error">
                  {error === "phone"
                    ? "Enter a valid phone number."
                    : "Enter a valid profile name."}
                </div>
              )}

              <form action={updateProfileAction} className="air-profile-form-new">
                <label>
                  <span>Display name</span>
                  <input
                    name="name"
                    defaultValue={profile.name}
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </label>

                <label>
                  <span>Phone</span>
                  <input
                    name="phone"
                    defaultValue={phone || ""}
                    maxLength={40}
                    placeholder="+212…"
                  />
                </label>

                <label className="sm:col-span-2">
                  <span>Email</span>
                  <input
                    value={email || ""}
                    readOnly
                    aria-readonly="true"
                  />
                </label>

                <div className="sm:col-span-2">
                  <button>
                    <Icon name="edit" className="h-4 w-4" />
                    Save changes
                  </button>
                </div>
              </form>
            </section>
          )}
        </main>

        <aside className="air-profile-sidebar-new">
          <section className="air-profile-trust-card-new">
            <div className="air-profile-trust-icon-new">
              <Icon name="shield" />
            </div>
            <span>36 trust</span>
            <h3>{isOwner ? "Studio Host" : "Creator"}</h3>
            <p>
              These signals come from real account and marketplace activity on
              36.
            </p>

            <div className="air-profile-trust-list">
              <div>
                <span>Identity</span>
                <b>{profile.emailVerified ? "Verified" : "Pending"}</b>
              </div>
              <div>
                <span>Sessions</span>
                <b>{profile.completedSessions}</b>
              </div>
              <div>
                <span>Reviews</span>
                <b>{profile.reviewCount}</b>
              </div>
            </div>
          </section>

          <section className="air-profile-brand-card">
            <div className="air-profile-brand-mark">36</div>
            <div>
              <span>Member profile</span>
              <h3>Create. Book. Connect.</h3>
              <p>
                One profile across studios, bookings, reviews and messages.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
