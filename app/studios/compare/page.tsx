import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { getCurrentUser } from "@/lib/auth";
import { getRoomAvailability } from "@/lib/booking";
import { db } from "@/lib/db";
import { categoryLabel } from "@/lib/studio";
import {
  getStudioTrustMetrics,
  responseTimeLabel,
} from "@/lib/trust";
import { trackMarketplaceEvent } from "@/lib/analytics";

function parseIds(value: string | undefined) {
  const seen = new Set<string>();
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(
      (item) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          item,
        ) &&
        !seen.has(item) &&
        seen.add(item),
    )
    .slice(0, 4);
}

function parseDuration(value: string | undefined) {
  const number = Math.round(Number(value || "1"));
  return Number.isFinite(number)
    ? Math.max(1, Math.min(12, number))
    : 1;
}

function averageRating(reviews: Array<{ rating: number }>) {
  return reviews.length
    ? reviews.reduce((sum, review) => sum + review.rating, 0) /
        reviews.length
    : null;
}

function listEquipment(
  rooms: Array<{
    equipment: Array<{ name: string }>;
  }>,
) {
  return Array.from(
    new Set(
      rooms.flatMap((room) =>
        room.equipment.map((item) => item.name),
      ),
    ),
  ).slice(0, 10);
}

function compareHref(
  ids: string[],
  date: string,
  durationHours: number,
) {
  const params = new URLSearchParams();
  params.set("ids", ids.join(","));
  if (date) params.set("date", date);
  params.set("duration", String(durationHours));
  return "/studios/compare?" + params.toString();
}

export default async function CompareStudiosPage({
  searchParams,
}: {
  searchParams: Promise<{
    ids?: string;
    date?: string;
    duration?: string;
  }>;
}) {
  const user = await getCurrentUser();
  const query = await searchParams;
  const ids = parseIds(query.ids);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(query.date || ""))
    ? String(query.date)
    : "";
  const durationHours = parseDuration(query.duration);

  if (ids.length < 2) {
    return (
      <main className="min-h-screen">
        <AppHeader user={user} />
        <section className="mx-auto max-w-5xl px-5 py-16 text-center">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-acid">
            Studio comparison
          </span>
          <h1 className="mt-3 text-4xl font-black">
            Choose at least two studios
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-zinc-500">
            Use the Compare button on marketplace cards. You can compare up to
            four verified studios side by side.
          </p>
          <Link
            href="/studios"
            className="mt-6 inline-flex rounded-xl bg-acid px-5 py-3 text-sm font-black text-black"
          >
            Browse studios
          </Link>
        </section>
      </main>
    );
  }

  const rows = await db.studio.findMany({
    where: {
      id: { in: ids },
      status: "VERIFIED",
    },
    include: {
      photos: {
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
      rooms: {
        where: { active: true },
        orderBy: { hourlyRateMad: "asc" },
        include: {
          equipment: {
            orderBy: { name: "asc" },
          },
        },
      },
      amenities: {
        orderBy: { name: "asc" },
      },
      reviews: {
        select: { rating: true },
      },
    },
  });

  const studios = ids
    .map((id) => rows.find((studio) => studio.id === id))
    .filter(
      (studio): studio is NonNullable<typeof studio> =>
        Boolean(studio),
    );

  if (studios.length < 2) {
    return (
      <main className="min-h-screen">
        <AppHeader user={user} />
        <section className="mx-auto max-w-5xl px-5 py-16 text-center">
          <h1 className="text-4xl font-black">
            Some studios are no longer available
          </h1>
          <p className="mt-3 text-sm text-zinc-500">
            Comparison only includes currently verified, bookable studios.
          </p>
          <Link
            href="/studios"
            className="mt-6 inline-flex rounded-xl bg-acid px-5 py-3 text-sm font-black text-black"
          >
            Choose studios again
          </Link>
        </section>
      </main>
    );
  }

  const [trustRows, availabilityRows] = await Promise.all([
    Promise.all(
      studios.map(async (studio) => ({
        id: studio.id,
        trust: await getStudioTrustMetrics(
          studio.id,
          studio.ownerId,
        ),
      })),
    ),
    date
      ? Promise.all(
          studios.map(async (studio) => {
            const roomChecks = await Promise.all(
              studio.rooms.map(async (room) => ({
                roomId: room.id,
                slots: await getRoomAvailability(
                  room.id,
                  date,
                  durationHours * 60,
                ),
              })),
            );
            return {
              id: studio.id,
              availableRooms: roomChecks.filter(
                (room) => room.slots.length > 0,
              ).length,
              earliestStart:
                roomChecks
                  .flatMap((room) => room.slots)
                  .map((slot) => slot.startAt)
                  .sort()[0] || null,
            };
          }),
        )
      : Promise.resolve(
          studios.map((studio) => ({
            id: studio.id,
            availableRooms: null,
            earliestStart: null,
          })),
        ),
  ]);

  await trackMarketplaceEvent({
    eventType: "STUDIO_COMPARE_VIEW",
    userId: user?.id,
    metadata: {
      studioIds: studios.map((studio) => studio.id).join(","),
      date: date || null,
      durationHours,
    },
  });

  const detailSuffix = (() => {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    params.set("duration", String(durationHours));
    return "?" + params.toString();
  })();

  const labels = [
    {
      label: "Starting price",
      render: (studio: (typeof studios)[number]) =>
        studio.rooms[0]
          ? studio.rooms[0].hourlyRateMad + " MAD/h"
          : "—",
    },
    {
      label: "Rating",
      render: (studio: (typeof studios)[number]) => {
        const average = averageRating(studio.reviews);
        return average
          ? "★ " +
              average.toFixed(1) +
              " · " +
              studio.reviews.length +
              " verified review" +
              (studio.reviews.length === 1 ? "" : "s")
          : "New on 36";
      },
    },
    {
      label: date ? "Live availability" : "Availability",
      render: (studio: (typeof studios)[number]) => {
        if (!date) return "Choose a date to compare live availability";
        const availability = availabilityRows.find(
          (row) => row.id === studio.id,
        );
        if (!availability?.availableRooms) return "No matching slot";
        return (
          availability.availableRooms +
          " room" +
          (availability.availableRooms === 1 ? "" : "s") +
          " available"
        );
      },
    },
    {
      label: "Rooms",
      render: (studio: (typeof studios)[number]) =>
        String(studio.rooms.length),
    },
    {
      label: "Maximum capacity",
      render: (studio: (typeof studios)[number]) => {
        const capacity = Math.max(
          0,
          ...studio.rooms.map((room) => room.capacity),
        );
        return capacity
          ? capacity + " people"
          : "—";
      },
    },
    {
      label: "Engineer included",
      render: (studio: (typeof studios)[number]) =>
        studio.rooms.some((room) => room.engineerIncluded)
          ? "Available"
          : "Not listed",
    },
    {
      label: "Equipment",
      render: (studio: (typeof studios)[number]) => {
        const items = listEquipment(studio.rooms);
        return items.length ? items.join(" · ") : "Not listed";
      },
    },
    {
      label: "Amenities",
      render: (studio: (typeof studios)[number]) =>
        studio.amenities.length
          ? studio.amenities
              .slice(0, 8)
              .map((item) => item.name)
              .join(" · ")
          : "Not listed",
    },
    {
      label: "Free cancellation",
      render: (studio: (typeof studios)[number]) =>
        studio.freeCancellationHours +
        "h before session",
    },
    {
      label: "Completed sessions",
      render: (studio: (typeof studios)[number]) =>
        String(
          trustRows.find((row) => row.id === studio.id)?.trust
            .completedSessions || 0,
        ),
    },
    {
      label: "Owner response",
      render: (studio: (typeof studios)[number]) => {
        const trust = trustRows.find(
          (row) => row.id === studio.id,
        )?.trust;
        if (
          !trust ||
          trust.responseSampleSize < 3 ||
          trust.responseRate == null
        ) {
          return "History building";
        }
        const time = responseTimeLabel(
          trust.typicalResponseMinutes,
        );
        return (
          trust.responseRate +
          "% response rate" +
          (time ? " · " + time : "")
        );
      },
    },
  ];

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-[1500px] px-5 py-10 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-acid">
              Decision tools
            </span>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              Compare studios
            </h1>
            <p className="mt-3 text-sm text-zinc-500">
              Side-by-side data from verified marketplace listings.
              {date
                ? " Live availability is checked for " +
                  date +
                  " · " +
                  durationHours +
                  "h."
                : ""}
            </p>
          </div>
          <Link href="/studios" className="button-dark">
            + Add another studio
          </Link>
        </div>

        <div className="mt-8 overflow-x-auto rounded-3xl border border-zinc-900 bg-zinc-950/50">
          <div
            className="grid min-w-[900px]"
            style={{
              gridTemplateColumns:
                "190px repeat(" +
                studios.length +
                ", minmax(220px, 1fr))",
            }}
          >
            <div className="border-b border-r border-zinc-900 bg-black/20 p-4" />
            {studios.map((studio) => {
              const remaining = studios
                .filter((item) => item.id !== studio.id)
                .map((item) => item.id);
              const photo = studio.photos[0]?.url;

              return (
                <div
                  key={studio.id}
                  className="border-b border-r border-zinc-900 p-4 last:border-r-0"
                >
                  <div className="aspect-[4/3] overflow-hidden rounded-2xl bg-zinc-900">
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
                  <span className="mt-4 block text-[9px] font-black uppercase tracking-[0.12em] text-acid">
                    36 verified
                  </span>
                  <h2 className="mt-1 text-lg font-black">
                    {studio.name}
                  </h2>
                  <p className="mt-1 text-xs text-zinc-600">
                    {studio.neighborhood || studio.city}, {studio.city}
                  </p>
                  <p className="mt-1 text-[10px] text-zinc-700">
                    {categoryLabel(studio.primaryCategory)}
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      href={
                        "/studios/" +
                        studio.slug +
                        detailSuffix
                      }
                      className="rounded-lg bg-acid px-3 py-2 text-[10px] font-black text-black"
                    >
                      View & book
                    </Link>
                    {remaining.length >= 2 && (
                      <Link
                        href={compareHref(
                          remaining,
                          date,
                          durationHours,
                        )}
                        className="rounded-lg border border-zinc-800 px-3 py-2 text-[10px] font-black text-zinc-500"
                      >
                        Remove
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}

            {labels.map((row, index) => (
              <div key={row.label} className="contents">
                <div
                  className={
                    "border-r border-zinc-900 p-4 text-xs font-black text-zinc-500 " +
                    (index < labels.length - 1
                      ? "border-b"
                      : "")
                  }
                >
                  {row.label}
                </div>
                {studios.map((studio) => (
                  <div
                    key={row.label + "-" + studio.id}
                    className={
                      "border-r border-zinc-900 p-4 text-sm leading-6 text-zinc-300 last:border-r-0 " +
                      (index < labels.length - 1
                        ? "border-b"
                        : "")
                    }
                  >
                    {row.render(studio)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 text-[10px] leading-5 text-zinc-700">
          Comparison reflects current owner-provided marketplace inventory.
          Availability and prices can change until a booking is confirmed.
        </p>
      </section>
    </main>
  );
}
