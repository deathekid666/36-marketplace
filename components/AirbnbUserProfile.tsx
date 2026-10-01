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

  return (
    <div className="grid gap-8 lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-14">
      <aside className="self-start lg:sticky lg:top-7">
        <section className="rounded-[2rem] border border-zinc-800 bg-[#11120f] p-7 shadow-[0_28px_90px_rgba(0,0,0,.42)]">
          <div className="text-center">
            <div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-acid text-3xl font-black text-black shadow-[0_16px_45px_rgba(217,255,67,.12)]">
              {initials}
            </div>

            <h1 className="mt-5 text-3xl font-black tracking-[-0.04em]">
              {profile.name}
            </h1>
            <p className="mt-1 text-sm font-semibold text-zinc-500">
              {publicRole}
            </p>
          </div>

          <div className="mt-7 grid grid-cols-3 divide-x divide-zinc-800 border-y border-zinc-800 py-5 text-center">
            <div className="px-2">
              <b className="block text-xl">
                {profile.reviewCount}
              </b>
              <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-600">
                Reviews
              </span>
            </div>
            <div className="px-2">
              <b className="block text-xl">
                {isOwner
                  ? studios.length
                  : profile.completedSessions}
              </b>
              <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-600">
                {isOwner ? "Studios" : "Sessions"}
              </span>
            </div>
            <div className="px-2">
              <b className="block text-xl">
                {years || "<1"}
              </b>
              <span className="mt-1 block text-[9px] font-bold uppercase tracking-[0.1em] text-zinc-600">
                {years === 1 ? "Year" : "Years"}
              </span>
            </div>
          </div>

          <div className="mt-6 space-y-4 text-sm">
            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-zinc-900 text-xs">
                ✓
              </span>
              <div>
                <b className="block text-xs">
                  Identity on 36
                </b>
                <span className="text-[10px] text-zinc-600">
                  {profile.emailVerified
                    ? "Email verified"
                    : "Email verification pending"}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-zinc-900 text-xs">
                ◷
              </span>
              <div>
                <b className="block text-xs">
                  Member since
                </b>
                <span className="text-[10px] text-zinc-600">
                  {memberSinceLabel(profile.createdAt)}
                </span>
              </div>
            </div>

            {isOwner && profile.averageRating != null && (
              <div className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-zinc-900 text-xs">
                  ★
                </span>
                <div>
                  <b className="block text-xs">
                    {profile.averageRating.toFixed(2)} host rating
                  </b>
                  <span className="text-[10px] text-zinc-600">
                    From verified completed sessions
                  </span>
                </div>
              </div>
            )}
          </div>

          {isSelf && (
            <Link
              href={"/profile/" + profile.id}
              className="mt-6 flex w-full justify-center rounded-xl border border-zinc-700 px-4 py-3 text-xs font-black text-zinc-300 hover:border-white"
            >
              View public profile
            </Link>
          )}
        </section>
      </aside>

      <div className="min-w-0">
        <section className="border-b border-zinc-800 pb-8">
          <span className="text-xs font-black uppercase tracking-[0.16em] text-acid">
            About
          </span>
          <h2 className="mt-2 text-3xl font-black">
            About {profile.name}
          </h2>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-zinc-500">
            {isOwner
              ? profile.name +
                " is a verified Studio Host on 36. Public profile activity is based on verified studio listings, completed sessions and marketplace reviews."
              : profile.name +
                " is a Creator on 36. Public profile activity is based on completed studio sessions and reviews written after verified bookings."}
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <span className="rounded-full border border-zinc-800 px-3 py-2 text-[10px] font-black text-zinc-400">
              {profile.emailVerified
                ? "✓ Email verified"
                : "Email pending"}
            </span>
            <span className="rounded-full border border-zinc-800 px-3 py-2 text-[10px] font-black text-zinc-400">
              {profile.completedSessions} completed session
              {profile.completedSessions === 1 ? "" : "s"}
            </span>
            {isOwner && (
              <span className="rounded-full border border-zinc-800 px-3 py-2 text-[10px] font-black text-zinc-400">
                {studios.length} verified studio
                {studios.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </section>

        {isSelf && (
          <section className="border-b border-zinc-800 py-8">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <span className="text-xs font-black uppercase tracking-[0.16em] text-acid">
                  Private
                </span>
                <h2 className="mt-2 text-2xl font-black">
                  Account details
                </h2>
                <p className="mt-2 text-xs leading-5 text-zinc-600">
                  Email and phone are only visible to you here. They are never shown on your public profile.
                </p>
              </div>
              {saved && (
                <span className="rounded-full border border-emerald-900/40 px-3 py-1.5 text-[10px] font-black text-emerald-300">
                  Saved
                </span>
              )}
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-900/40 bg-red-950/10 p-4 text-xs text-red-300">
                {error === "phone"
                  ? "Enter a valid phone number."
                  : "Enter a valid profile name."}
              </div>
            )}

            <form
              action={updateProfileAction}
              className="mt-5 grid gap-4 sm:grid-cols-2"
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
                <button className="rounded-xl bg-acid px-5 py-3 text-xs font-black text-black">
                  Save profile
                </button>
              </div>
            </form>
          </section>
        )}

        {isOwner && (
          <section className="border-b border-zinc-800 py-8">
            <div className="flex items-end justify-between gap-4">
              <div>
                <span className="text-xs font-black uppercase tracking-[0.16em] text-acid">
                  Hosting
                </span>
                <h2 className="mt-2 text-2xl font-black">
                  {profile.name}&apos;s studios
                </h2>
              </div>
              {studios.length > 0 && (
                <span className="text-xs text-zinc-600">
                  {studios.length} verified
                </span>
              )}
            </div>

            {studios.length === 0 ? (
              <p className="mt-5 text-sm text-zinc-600">
                No public verified studios yet.
              </p>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {studios.map((studio) => (
                  <Link
                    key={studio.id}
                    href={"/studios/" + studio.slug}
                    className="group overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950/60 transition hover:border-zinc-700"
                  >
                    <div className="aspect-[16/10] overflow-hidden bg-zinc-900">
                      {studio.photoUrl ? (
                        <img
                          src={studio.photoUrl}
                          alt={studio.name}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="grid h-full place-items-center text-3xl font-black text-acid">
                          36
                        </div>
                      )}
                    </div>

                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <b className="block truncate text-sm">
                            {studio.name}
                          </b>
                          <span className="mt-1 block text-[10px] text-zinc-600">
                            {studio.neighborhood || studio.city}
                            {studio.neighborhood ? ", " + studio.city : ""}
                          </span>
                        </div>
                        <span className="shrink-0 text-xs font-black">
                          {studio.rating != null
                            ? "★ " + studio.rating.toFixed(1)
                            : "New"}
                        </span>
                      </div>

                      <p className="mt-3 text-xs">
                        <b>
                          {studio.priceMad
                            ? studio.priceMad + " MAD"
                            : "—"}
                        </b>
                        <span className="text-zinc-600">
                          {" "}
                          / hour
                        </span>
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="py-8">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.16em] text-acid">
              Reviews
            </span>
            <h2 className="mt-2 text-2xl font-black">
              {isOwner
                ? "Reviews from creators"
                : "Reviews written by " + profile.name}
            </h2>
            <p className="mt-2 text-xs leading-5 text-zinc-600">
              Only reviews tied to completed 36 bookings appear here.
            </p>
          </div>

          {reviews.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-zinc-800 p-8 text-sm text-zinc-600">
              No verified review activity yet.
            </div>
          ) : (
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {reviews.map((review) => (
                <article
                  key={review.id}
                  className="rounded-2xl border border-zinc-900 bg-zinc-950/40 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      {review.direction === "RECEIVED" &&
                      review.personId ? (
                        <Link
                          href={"/profile/" + review.personId}
                          className="text-sm font-black hover:text-acid"
                        >
                          {review.personName}
                        </Link>
                      ) : (
                        <b className="text-sm">
                          {review.studioName}
                        </b>
                      )}
                      <p className="mt-1 text-[10px] text-zinc-600">
                        {new Intl.DateTimeFormat("en", {
                          month: "short",
                          year: "numeric",
                          timeZone: "UTC",
                        }).format(review.createdAt)}
                      </p>
                    </div>
                    <span className="text-xs font-black text-acid">
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
                    className="mt-4 inline-flex text-[10px] font-black text-zinc-500 hover:text-white"
                  >
                    {review.studioName} →
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
