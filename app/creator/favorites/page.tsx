import Link from "next/link";

import { toggleFavoriteAction } from "@/app/favorites/actions";
import { AppHeader } from "@/components/AppHeader";
import { CompareStudioButton } from "@/components/CompareStudioButton";
import { CompareTray } from "@/components/CompareTray";
import { ShortlistProjects } from "@/components/ShortlistProjects";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function FavoritesPage() {
  const user = await requireRole("CREATOR");
  const favorites = await db.favorite.findMany({
    where: {
      userId: user.id,
      studio: { status: "VERIFIED" },
    },
    include: {
      studio: {
        include: {
          photos: {
            orderBy: { sortOrder: "asc" },
            take: 1,
          },
          rooms: {
            where: { active: true },
            orderBy: { hourlyRateMad: "asc" },
            take: 1,
          },
          reviews: {
            select: { rating: true },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const projectStudios = favorites.map(({ studio }) => ({
    id: studio.id,
    name: studio.name,
    slug: studio.slug,
    city: studio.city,
    priceMad: studio.rooms[0]?.hourlyRateMad || null,
    photoUrl: studio.photos[0]?.url || null,
  }));

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />

      <section className="mx-auto max-w-7xl px-5 py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-acid">
              Saved places
            </span>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              Favorites
            </h1>
            <p className="mt-3 text-sm text-zinc-500">
              Save studios, organize them into project shortlists,
              compare options and decide with context.
            </p>
          </div>

          <Link
            href="/studios"
            className="rounded-full bg-acid px-5 py-3 text-xs font-black text-black"
          >
            Find more studios
          </Link>
        </div>

        {favorites.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-zinc-800 p-10 text-center">
            <p className="text-sm text-zinc-500">
              No saved studios yet.
            </p>
            <Link
              href="/studios"
              className="mt-5 inline-flex rounded-full bg-acid px-5 py-3 text-xs font-black text-black"
            >
              Browse studios
            </Link>
          </div>
        ) : (
          <>
            <ShortlistProjects studios={projectStudios} />

            <div className="mt-10">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <span className="text-xs font-bold uppercase tracking-[0.16em] text-acid">
                    All favorites
                  </span>
                  <h2 className="mt-2 text-3xl font-black">
                    Saved studios
                  </h2>
                </div>
                <span className="text-xs text-zinc-600">
                  {favorites.length} saved
                </span>
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
                {favorites.map(({ studio }) => {
                  const photo = studio.photos[0]?.url;
                  const rate = studio.rooms[0]?.hourlyRateMad;
                  const average = studio.reviews.length
                    ? studio.reviews.reduce(
                        (sum, review) =>
                          sum + review.rating,
                        0,
                      ) / studio.reviews.length
                    : null;

                  return (
                    <article
                      key={studio.id}
                      className="overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950/70"
                    >
                      <Link href={"/studios/" + studio.slug}>
                        <div className="h-48 bg-zinc-900">
                          {photo ? (
                            <img
                              src={photo}
                              alt={studio.name}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="grid h-full place-items-center text-4xl font-black text-acid">
                              36
                            </div>
                          )}
                        </div>
                        <div className="p-5">
                          <h3 className="text-xl font-black">
                            {studio.name}
                          </h3>
                          <p className="mt-1 text-xs text-zinc-600">
                            {studio.neighborhood ||
                              studio.city}
                            {rate
                              ? " · from " +
                                rate +
                                " MAD/h"
                              : ""}
                          </p>
                          <p className="mt-2 text-xs text-acid">
                            {average
                              ? "★ " + average.toFixed(1)
                              : "New"}
                          </p>
                        </div>
                      </Link>

                      <div className="flex items-center justify-between gap-3 border-t border-zinc-900 p-4">
                        <form action={toggleFavoriteAction}>
                          <input
                            type="hidden"
                            name="studioId"
                            value={studio.id}
                          />
                          <input
                            type="hidden"
                            name="returnTo"
                            value="/creator/favorites"
                          />
                          <button className="text-xs font-bold text-zinc-500 hover:text-red-300">
                            Remove from favorites
                          </button>
                        </form>

                        <CompareStudioButton
                          studioId={studio.id}
                          studioName={studio.name}
                        />
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <CompareTray date="" durationHours={1} />
      </section>
    </main>
  );
}
