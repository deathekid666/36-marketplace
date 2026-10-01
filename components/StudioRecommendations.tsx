import Link from "next/link";

import type { RecommendedStudio } from "@/lib/recommendations";
import { categoryLabel } from "@/lib/studio";

type Group = {
  title: string;
  subtitle: string;
  rows: RecommendedStudio[];
};

function RecommendationCard({
  studio,
  detailSuffix,
}: {
  studio: RecommendedStudio;
  detailSuffix: string;
}) {
  return (
    <Link
      href={"/studios/" + studio.slug + detailSuffix}
      className="group overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950/70 transition hover:border-zinc-700"
    >
      <div className="aspect-[4/3] overflow-hidden bg-zinc-900">
        {studio.photoUrl ? (
          <img
            src={studio.photoUrl}
            alt={studio.name}
            className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
          />
        ) : (
          <div className="grid h-full place-items-center text-4xl font-black text-acid">
            36
          </div>
        )}
      </div>

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black">
              {studio.name}
            </h3>
            <p className="mt-1 truncate text-[10px] text-zinc-600">
              {studio.neighborhood || studio.city} ·{" "}
              {categoryLabel(studio.primaryCategory)}
            </p>
          </div>
          <span className="shrink-0 text-xs font-black">
            {studio.rating
              ? "★ " + studio.rating.toFixed(1)
              : "New"}
          </span>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3 text-xs">
          <span>
            <b>{studio.priceMad ? studio.priceMad + " MAD" : "—"}</b>
            <span className="text-zinc-600"> / hour</span>
          </span>
          {studio.distanceKm != null && (
            <span className="text-zinc-600">
              {studio.distanceKm < 10
                ? studio.distanceKm.toFixed(1)
                : Math.round(studio.distanceKm)}
              {" "}km
            </span>
          )}
        </div>

        {studio.reasons.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {studio.reasons.map((reason) => (
              <span
                key={reason}
                className="rounded-full border border-zinc-900 px-2 py-1 text-[9px] font-bold text-zinc-500"
              >
                {reason}
              </span>
            ))}
          </div>
        )}

        {studio.availableRooms != null && (
          <p
            className={
              "mt-3 text-[10px] font-black " +
              (studio.availableRooms > 0
                ? "text-emerald-300"
                : "text-zinc-700")
            }
          >
            {studio.availableRooms > 0
              ? studio.availableRooms +
                " room" +
                (studio.availableRooms === 1 ? "" : "s") +
                " available"
              : "No matching slot"}
          </p>
        )}
      </div>
    </Link>
  );
}

export function StudioRecommendations({
  similar,
  cheaper,
  nearby,
  available,
  date,
  durationHours,
}: {
  similar: RecommendedStudio[];
  cheaper: RecommendedStudio[];
  nearby: RecommendedStudio[];
  available: RecommendedStudio[];
  date?: string;
  durationHours: number;
}) {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  params.set("duration", String(durationHours));
  const detailSuffix = "?" + params.toString();

  const groups: Group[] = [
    {
      title: date
        ? "Available alternatives"
        : "Similar studios",
      subtitle: date
        ? "Other verified studios with room availability for the same date."
        : "Matched by studio type, location, price, equipment and amenities.",
      rows: date && available.length ? available : similar,
    },
    {
      title: "Cheaper alternatives",
      subtitle:
        "Verified studios with a lower starting hourly rate.",
      rows: cheaper,
    },
    {
      title: "Nearby studios",
      subtitle:
        "Verified alternatives closest to this location.",
      rows: nearby,
    },
  ].filter((group) => group.rows.length > 0);

  if (!groups.length) return null;

  return (
    <section className="mt-14 space-y-10">
      {groups.map((group) => (
        <div key={group.title}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.16em] text-acid">
                Smart discovery
              </span>
              <h2 className="mt-2 text-3xl font-black">
                {group.title}
              </h2>
              <p className="mt-2 text-xs leading-5 text-zinc-600">
                {group.subtitle}
              </p>
            </div>
            <Link
              href="/studios"
              className="text-xs font-black text-acid"
            >
              Browse all →
            </Link>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {group.rows.map((studio) => (
              <RecommendationCard
                key={studio.id}
                studio={studio}
                detailSuffix={detailSuffix}
              />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
