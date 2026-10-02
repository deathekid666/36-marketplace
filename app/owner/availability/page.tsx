import Link from "next/link";

import {
  addBlockedSlotAction,
  blockFullDayAction,
  blockVacationRangeAction,
  removeBlockedSlotAction,
} from "@/app/owner/actions";
import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  formatMarketplaceDateTime,
  marketplaceDateTimeLocalToUtc,
  studioTimeZone,
} from "@/lib/time";

function localMonthKey(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value || "2026";
  const month = parts.find((part) => part.type === "month")?.value || "01";
  return year + "-" + month;
}

function parseMonth(value: string | undefined, timeZone: string) {
  return /^\d{4}-\d{2}$/.test(String(value || ""))
    ? String(value)
    : localMonthKey(new Date(), timeZone);
}

function shiftMonth(value: string, delta: number) {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return (
    date.getUTCFullYear() +
    "-" +
    String(date.getUTCMonth() + 1).padStart(2, "0")
  );
}

function daysInMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function weekdayOffset(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
}

function nextDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 1);
  return (
    date.getUTCFullYear() +
    "-" +
    String(date.getUTCMonth() + 1).padStart(2, "0") +
    "-" +
    String(date.getUTCDate()).padStart(2, "0")
  );
}

function dateKey(month: string, day: number) {
  return month + "-" + String(day).padStart(2, "0");
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

export default async function OwnerAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{
    studioId?: string;
    roomId?: string;
    month?: string;
    error?: string;
  }>;
}) {
  const user = await requireRole("STUDIO_OWNER");
  const query = await searchParams;

  const studios = await db.studio.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      status: true,
      latitude: true,
      longitude: true,
      rooms: {
        where: { active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      },
    },
  });

  if (!studios.length) {
    return (
      <main className="min-h-screen bg-white text-[#222]">
        <AppHeader user={user} />
        <section className="mx-auto max-w-4xl px-5 py-14 text-center">
          <h1 className="text-4xl font-black">Availability</h1>
          <p className="mt-3 text-sm text-[#717171]">
            Create a studio before configuring its calendar.
          </p>
          <Link
            href="/owner/studios/new"
            className="mt-6 inline-flex rounded-xl bg-acid px-5 py-3 text-sm font-black text-white"
          >
            Create studio
          </Link>
        </section>
      </main>
    );
  }

  const studio =
    studios.find((item) => item.id === query.studioId) || studios[0];
  const timeZone = studioTimeZone(studio);
  const roomId =
    query.roomId &&
    studio.rooms.some((room) => room.id === query.roomId)
      ? query.roomId
      : "ALL";
  const month = parseMonth(query.month, timeZone);
  const previousMonth = shiftMonth(month, -1);
  const nextMonth = shiftMonth(month, 1);
  const firstKey = month + "-01";
  const nextMonthKey = nextMonth + "-01";
  const rangeStart = marketplaceDateTimeLocalToUtc(
    firstKey + "T00:00",
    timeZone,
  )!;
  const rangeEnd = marketplaceDateTimeLocalToUtc(
    nextMonthKey + "T00:00",
    timeZone,
  )!;

  const roomIds =
    roomId === "ALL"
      ? studio.rooms.map((room) => room.id)
      : [roomId];

  const [bookings, blockedSlots] = await Promise.all([
    db.booking.findMany({
      where: {
        studioId: studio.id,
        roomId: { in: roomIds },
        status: { in: ["PENDING_DEPOSIT", "CONFIRMED"] },
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
      },
      orderBy: { startAt: "asc" },
      include: {
        room: { select: { id: true, name: true } },
        creator: { select: { name: true } },
      },
    }),
    db.blockedSlot.findMany({
      where: {
        roomId: { in: roomIds },
        startAt: { lt: rangeEnd },
        endAt: { gt: rangeStart },
      },
      orderBy: { startAt: "asc" },
      include: {
        room: { select: { id: true, name: true } },
      },
    }),
  ]);

  const count = daysInMonth(month);
  const offset = weekdayOffset(month);
  const cells = Array.from({ length: count }, (_, index) => {
    const day = index + 1;
    const key = dateKey(month, day);
    const startAt = marketplaceDateTimeLocalToUtc(
      key + "T00:00",
      timeZone,
    )!;
    const endAt = marketplaceDateTimeLocalToUtc(
      nextDateKey(key) + "T00:00",
      timeZone,
    )!;
    const dayBookings = bookings.filter(
      (booking) => booking.startAt < endAt && booking.endAt > startAt,
    );
    const dayBlocks = blockedSlots.filter(
      (slot) => slot.startAt < endAt && slot.endAt > startAt,
    );
    return { day, key, dayBookings, dayBlocks };
  });

  const selectedRoomName =
    roomId === "ALL"
      ? "All rooms"
      : studio.rooms.find((room) => room.id === roomId)?.name || "Room";
  const upcomingBlocks = blockedSlots.filter((slot) => slot.endAt > new Date());

  function hrefFor(params: {
    month?: string;
    roomId?: string;
    studioId?: string;
  }) {
    const next = new URLSearchParams();
    next.set("studioId", params.studioId || studio.id);
    next.set("roomId", params.roomId || roomId);
    next.set("month", params.month || month);
    return "/owner/availability?" + next.toString();
  }

  return (
    <main className="min-h-screen bg-white text-[#222]">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-5 py-10 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.18em] text-acid">
              Owner calendar
            </span>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
              Availability
            </h1>
            <p className="mt-3 text-sm text-[#717171]">
              Block dates and hours in the studio’s local time without changing your verified listing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/owner/studios/${studio.id}/preview`}
              className="rounded-full border border-[#cfcfcf] px-5 py-3 text-xs font-black"
            >
              Preview listing
            </Link>
            <Link
              href={hrefFor({ month: localMonthKey(new Date(), timeZone) })}
              className="rounded-full border border-[#cfcfcf] px-5 py-3 text-xs font-black"
            >
              Today
            </Link>
            <Link
              href="/owner/bookings"
              className="rounded-full border border-[#cfcfcf] px-5 py-3 text-xs font-black"
            >
              Booking dashboard
            </Link>
          </div>
        </div>

        {query.error === "booking-conflict" && (
          <div className="mt-6 rounded-xl border border-red-900/50 bg-red-950/15 p-4 text-sm text-red-300">
            That block overlaps an existing confirmed booking or active hold.
            The existing booking was kept unchanged.
          </div>
        )}

        <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_340px]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-[#ebebeb] bg-white p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="label">Studio</span>
                  <div className="rounded-xl border border-[#dddddd] bg-white px-4 py-3 text-sm font-semibold">
                    {studio.name}
                  </div>
                  {studios.length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {studios.map((item) => (
                        <Link
                          key={item.id}
                          href={hrefFor({
                            studioId: item.id,
                            roomId: "ALL",
                          })}
                          className={
                            "rounded-full border px-3 py-1.5 text-[10px] font-black " +
                            (item.id === studio.id
                              ? "border-acid/40 text-acid"
                              : "border-[#dddddd] text-[#717171]")
                          }
                        >
                          {item.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <span className="label">Room filter</span>
                  <div className="flex flex-wrap gap-2">
                    <Link
                      href={hrefFor({ roomId: "ALL" })}
                      className={
                        "rounded-full border px-3 py-2 text-[10px] font-black " +
                        (roomId === "ALL"
                          ? "border-acid/40 bg-acid/[0.05] text-acid"
                          : "border-[#dddddd] text-[#717171]")
                      }
                    >
                      All rooms
                    </Link>
                    {studio.rooms.map((room) => (
                      <Link
                        key={room.id}
                        href={hrefFor({ roomId: room.id })}
                        className={
                          "rounded-full border px-3 py-2 text-[10px] font-black " +
                          (roomId === room.id
                            ? "border-acid/40 bg-acid/[0.05] text-acid"
                            : "border-[#dddddd] text-[#717171]")
                        }
                      >
                        {room.name}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-[#ebebeb] bg-white p-4 sm:p-5">
              <div className="flex items-center justify-between gap-4">
                <Link
                  href={hrefFor({ month: previousMonth })}
                  className="grid h-10 w-10 place-items-center rounded-full border border-[#dddddd] text-[#555555] hover:text-[#222222]"
                >
                  ←
                </Link>
                <div className="text-center">
                  <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a8a8a]">
                    {selectedRoomName}
                  </span>
                  <h2 className="mt-1 text-xl font-black">
                    {monthLabel(month)}
                  </h2>
                  <span className="mt-1 block text-[9px] text-[#a3a3a3]">
                    {timeZone}
                  </span>
                </div>
                <Link
                  href={hrefFor({ month: nextMonth })}
                  className="grid h-10 w-10 place-items-center rounded-full border border-[#dddddd] text-[#555555] hover:text-[#222222]"
                >
                  →
                </Link>
              </div>

              <div className="mt-5 grid grid-cols-7 gap-1 text-center">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
                  (day) => (
                    <div
                      key={day}
                      className="py-2 text-[9px] font-black uppercase tracking-[0.1em] text-[#a3a3a3]"
                    >
                      {day}
                    </div>
                  ),
                )}
                {Array.from({ length: offset }, (_, index) => (
                  <div key={"blank-" + index} />
                ))}
                {cells.map((cell) => {
                  const hasBooking = cell.dayBookings.length > 0;
                  const hasBlock = cell.dayBlocks.length > 0;

                  return (
                    <div
                      key={cell.key}
                      className={
                        "min-h-28 rounded-xl border p-2 text-left " +
                        (hasBooking
                          ? "border-acid/30 bg-acid/[0.035]"
                          : hasBlock
                            ? "border-amber-900/35 bg-amber-950/10"
                            : "border-[#ebebeb] bg-[#f7f7f7]")
                      }
                    >
                      <div className="flex items-start justify-between gap-1">
                        <b className="text-xs">{cell.day}</b>
                        <div className="flex gap-1">
                          {hasBooking && (
                            <span className="rounded-full bg-acid px-1.5 py-0.5 text-[8px] font-black text-white">
                              {cell.dayBookings.length} B
                            </span>
                          )}
                          {hasBlock && (
                            <span className="rounded-full border border-amber-900/40 px-1.5 py-0.5 text-[8px] font-black text-amber-600">
                              {cell.dayBlocks.length} X
                            </span>
                          )}
                        </div>
                      </div>

                      {hasBooking && (
                        <div className="mt-2 space-y-1">
                          {cell.dayBookings.slice(0, 2).map((booking) => (
                            <Link
                              key={booking.id}
                              href={"/owner/bookings/" + booking.id}
                              className="block truncate text-[9px] font-bold text-acid"
                            >
                              {booking.room.name} · {booking.creator.name}
                            </Link>
                          ))}
                        </div>
                      )}

                      {!hasBooking && !hasBlock && studio.rooms.length > 0 && (
                        <form action={blockFullDayAction} className="mt-3">
                          <input
                            type="hidden"
                            name="studioId"
                            value={studio.id}
                          />
                          <input
                            type="hidden"
                            name="roomId"
                            value={roomId}
                          />
                          <input
                            type="hidden"
                            name="date"
                            value={cell.key}
                          />
                          <button className="text-[9px] font-black text-[#a3a3a3] hover:text-amber-600">
                            + Block day
                          </button>
                        </form>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-wrap gap-4 text-[10px] text-[#8a8a8a]">
                <span>
                  <b className="text-acid">B</b> booking
                </span>
                <span>
                  <b className="text-amber-600">X</b> unavailable block
                </span>
                <span>Calendar changes do not affect verification status.</span>
              </div>
            </section>
          </div>

          <aside className="space-y-5">
            <section className="panel">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">
                Block hours
              </span>
              <h2 className="mt-2 text-xl font-black">Room exception</h2>
              {studio.rooms.length ? (
                <form action={addBlockedSlotAction} className="mt-5 space-y-3">
                  <input type="hidden" name="studioId" value={studio.id} />
                  <label>
                    <span className="label">Room</span>
                    <select className="field" name="roomId">
                      {studio.rooms.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="label">From</span>
                    <input
                      className="field"
                      name="startAt"
                      type="datetime-local"
                      required
                    />
                  </label>
                  <label>
                    <span className="label">To</span>
                    <input
                      className="field"
                      name="endAt"
                      type="datetime-local"
                      required
                    />
                  </label>
                  <label>
                    <span className="label">Reason</span>
                    <input
                      className="field"
                      name="reason"
                      placeholder="Maintenance / private session"
                    />
                  </label>
                  <button className="button-dark w-full">Block time</button>
                </form>
              ) : (
                <p className="mt-4 text-xs text-[#8a8a8a]">Add a room first.</p>
              )}
            </section>

            <section className="panel">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-amber-600">
                Vacation mode
              </span>
              <h2 className="mt-2 text-xl font-black">Block every room</h2>
              <p className="mt-2 text-xs leading-5 text-[#8a8a8a]">
                Use this for holidays, renovation or studio-wide closure.
              </p>
              <form action={blockVacationRangeAction} className="mt-5 space-y-3">
                <input type="hidden" name="studioId" value={studio.id} />
                <label>
                  <span className="label">First unavailable day</span>
                  <input className="field" name="startDate" type="date" required />
                </label>
                <label>
                  <span className="label">Last unavailable day</span>
                  <input className="field" name="endDate" type="date" required />
                </label>
                <label>
                  <span className="label">Reason</span>
                  <input
                    className="field"
                    name="reason"
                    placeholder="Vacation / renovation"
                  />
                </label>
                <button className="w-full rounded-xl border border-amber-900/40 px-4 py-3 text-xs font-black text-amber-600">
                  Block studio range
                </button>
              </form>
            </section>

            <section className="panel">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black">Current blocks</h2>
                <span className="text-xs text-[#8a8a8a]">
                  {upcomingBlocks.length}
                </span>
              </div>
              <div className="mt-4 space-y-2">
                {upcomingBlocks.length === 0 ? (
                  <p className="text-xs text-[#8a8a8a]">
                    No upcoming blocked time in this month.
                  </p>
                ) : (
                  upcomingBlocks.slice(0, 12).map((slot) => (
                    <div
                      key={slot.id}
                      className="rounded-xl border border-[#ebebeb] bg-[#f7f7f7] p-3"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <b className="text-xs">{slot.room.name}</b>
                          <span className="mt-1 block text-[10px] leading-4 text-[#8a8a8a]">
                            {formatMarketplaceDateTime(slot.startAt, timeZone)} →{" "}
                            {formatMarketplaceDateTime(slot.endAt, timeZone)}
                          </span>
                          {slot.reason && (
                            <span className="mt-1 block text-[10px] text-[#a3a3a3]">
                              {slot.reason}
                            </span>
                          )}
                        </div>
                        <form action={removeBlockedSlotAction}>
                          <input
                            type="hidden"
                            name="studioId"
                            value={studio.id}
                          />
                          <input type="hidden" name="slotId" value={slot.id} />
                          <button className="text-[9px] font-black text-red-400/70 hover:text-red-300">
                            Remove
                          </button>
                        </form>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
