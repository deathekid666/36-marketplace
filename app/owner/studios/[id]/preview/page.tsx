import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import { StudioProfileGallery } from "@/components/StudioProfileGallery";
import { requireOwnedStudio } from "@/lib/owner";
import { DAYS, categoryLabel, studioCompletion } from "@/lib/studio";

export default async function OwnerStudioPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user, studio } = await requireOwnedStudio(id);
  const completion = studioCompletion(studio);
  const activeRooms = studio.rooms.filter((room) => room.active);
  const minPrice = activeRooms.length
    ? Math.min(...activeRooms.map((room) => room.hourlyRateMad))
    : null;
  const maxCapacity = activeRooms.length
    ? Math.max(...activeRooms.map((room) => room.capacity))
    : 0;

  return (
    <main className="min-h-screen bg-white text-[#222]">
      <AppHeader user={user} />

      <div className="sticky top-0 z-[70] border-b border-[#e8e8e8] bg-[#fff8dc]/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <b className="text-sm">Owner preview</b>
            <span className="ml-2 text-xs text-[#717171]">
              This page is private and does not require the studio to be verified.
            </span>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/owner/studios/${studio.id}`}
              className="rounded-full border border-[#cfcfcf] bg-white px-4 py-2 text-xs font-black"
            >
              Edit listing
            </Link>
            {studio.status === "VERIFIED" && (
              <Link
                href={`/studios/${studio.slug}`}
                className="rounded-full bg-[#222] px-4 py-2 text-xs font-black text-white"
              >
                Open live page ↗
              </Link>
            )}
          </div>
        </div>
      </div>

      <section className="mx-auto max-w-7xl px-5 pb-16 pt-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <span className="text-xs font-black uppercase tracking-[0.14em] text-acid">
              {categoryLabel(studio.primaryCategory)}
            </span>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] sm:text-5xl">
              {studio.name || "Untitled studio"}
            </h1>
            <p className="mt-3 text-sm text-[#717171]">
              {studio.neighborhood ? studio.neighborhood + ", " : ""}
              {studio.city}
              {maxCapacity ? " · Up to " + maxCapacity + " people" : ""}
              {activeRooms.length ? " · " + activeRooms.length + " room" + (activeRooms.length === 1 ? "" : "s") : ""}
            </p>
          </div>

          <div className="rounded-2xl border border-[#e7e7e7] bg-[#f7f7f7] px-5 py-4 text-right">
            <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[#8a8a8a]">
              Listing readiness
            </span>
            <b className="mt-1 block text-2xl">{completion}%</b>
            <span className="text-[10px] text-[#8a8a8a]">{studio.status.replaceAll("_", " ")}</span>
          </div>
        </div>

        <StudioProfileGallery
          studioName={studio.name}
          photos={studio.photos.map((photo) => ({
            id: photo.id,
            url: photo.url,
            alt: photo.alt,
          }))}
        />

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
          <div className="min-w-0 space-y-8">
            <section className="border-b border-[#ebebeb] pb-8">
              <span className="text-xs font-black uppercase tracking-[0.12em] text-[#8a8a8a]">About</span>
              <h2 className="mt-2 text-2xl font-black">About this studio</h2>
              <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-7 text-[#555]">
                {studio.description || "Add a description so creators understand the space, setup and best use cases."}
              </p>
            </section>

            <section className="border-b border-[#ebebeb] pb-8">
              <span className="text-xs font-black uppercase tracking-[0.12em] text-[#8a8a8a]">Amenities</span>
              <h2 className="mt-2 text-2xl font-black">What this studio offers</h2>
              {studio.amenities.length ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {studio.amenities.map((amenity) => (
                    <div key={amenity.id} className="rounded-2xl border border-[#ebebeb] p-4 text-sm">
                      <span className="mr-2 text-acid">✓</span>{amenity.name}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-sm text-[#8a8a8a]">No amenities added yet.</p>
              )}
            </section>

            <section className="border-b border-[#ebebeb] pb-8">
              <span className="text-xs font-black uppercase tracking-[0.12em] text-[#8a8a8a]">Rooms</span>
              <h2 className="mt-2 text-2xl font-black">Choose your setup</h2>
              <div className="mt-5 space-y-4">
                {activeRooms.length ? activeRooms.map((room) => (
                  <article key={room.id} className="rounded-3xl border border-[#e7e7e7] p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-acid">{categoryLabel(room.category)}</span>
                        <h3 className="mt-2 text-xl font-black">{room.name}</h3>
                        <p className="mt-2 text-xs text-[#8a8a8a]">
                          Capacity {room.capacity} · Minimum {room.minimumHours}h
                          {room.engineerIncluded ? " · Engineer included" : ""}
                        </p>
                      </div>
                      <div className="text-right">
                        <b className="text-xl">{room.hourlyRateMad} MAD</b>
                        <span className="block text-[10px] text-[#8a8a8a]">/ hour</span>
                      </div>
                    </div>
                    {room.description && <p className="mt-4 text-sm leading-6 text-[#717171]">{room.description}</p>}
                    {room.equipment.length > 0 && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {room.equipment.map((item) => (
                          <span key={item.id} className="rounded-full border border-[#dddddd] px-3 py-1.5 text-[10px] font-bold">
                            {item.name}{item.quantity > 1 ? " ×" + item.quantity : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </article>
                )) : (
                  <div className="rounded-2xl border border-dashed border-[#d8d8d8] p-6 text-sm text-[#8a8a8a]">
                    Add at least one active room to make the studio bookable.
                  </div>
                )}
              </div>
            </section>

            <section>
              <span className="text-xs font-black uppercase tracking-[0.12em] text-[#8a8a8a]">Schedule</span>
              <h2 className="mt-2 text-2xl font-black">Opening hours</h2>
              <div className="mt-5 max-w-xl divide-y divide-[#ebebeb]">
                {DAYS.map((day, index) => {
                  const hours = studio.openingHours.find((row) => row.dayOfWeek === index);
                  return (
                    <div key={day} className="flex items-center justify-between py-3 text-sm">
                      <b>{day}</b>
                      <span className="text-[#717171]">
                        {!hours || hours.closed ? "Closed" : hours.opensAt + " – " + hours.closesAt}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <aside>
            <div className="sticky top-24 rounded-3xl border border-[#dddddd] bg-white p-6 shadow-[0_14px_40px_rgba(0,0,0,.08)]">
              <div className="flex items-baseline gap-1">
                <b className="text-2xl">{minPrice ? minPrice + " MAD" : "No price yet"}</b>
                {minPrice && <span className="text-xs text-[#8a8a8a]">/ hour</span>}
              </div>
              <p className="mt-2 text-xs text-[#717171]">This is how the booking card will appear around your public listing.</p>

              <div className="mt-5 space-y-3 rounded-2xl border border-[#ebebeb] bg-[#f7f7f7] p-4 text-xs">
                <div className="flex justify-between gap-4"><span className="text-[#8a8a8a]">Deposit</span><b>{studio.depositPercent}%</b></div>
                <div className="flex justify-between gap-4"><span className="text-[#8a8a8a]">Free cancellation</span><b>{studio.freeCancellationHours}h</b></div>
                <div className="flex justify-between gap-4"><span className="text-[#8a8a8a]">Rooms</span><b>{activeRooms.length}</b></div>
              </div>

              <Link
                href={`/owner/availability?studioId=${studio.id}`}
                className="mt-5 flex w-full justify-center rounded-xl bg-acid px-5 py-4 text-sm font-black text-[#111]"
              >
                Check owner calendar
              </Link>
              <Link
                href={`/owner/studios/${studio.id}`}
                className="mt-3 flex w-full justify-center rounded-xl border border-[#dddddd] px-5 py-3 text-xs font-black"
              >
                Edit listing
              </Link>
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
