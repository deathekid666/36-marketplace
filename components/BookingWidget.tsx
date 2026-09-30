"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { DateCalendar } from "@/components/DateCalendar";

type RoomOption = {
  id: string;
  name: string;
  hourlyRateMad: number;
  minimumHours: number;
  engineerIncluded: boolean;
};

type AddonOption = {
  id: string;
  roomId: string | null;
  name: string;
  description: string;
  unitPriceMad: number;
  unitLabel: string;
};

type Slot = { startAt: string; endAt: string; label: string };

function defaultDate() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

function friendlyDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return "Choose date";
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(y, m - 1, d));
}

export function BookingWidget({
  rooms,
  addons = [],
  userRole,
  depositPercent,
  initialDate,
  initialDurationHours,
  initialStartAt,
  taxRateBps = 0,
  locationLabel,
}: {
  rooms: RoomOption[];
  addons?: AddonOption[];
  userRole?: "CREATOR" | "STUDIO_OWNER" | "ADMIN" | null;
  depositPercent: number;
  initialDate?: string;
  initialDurationHours?: number;
  initialStartAt?: string;
  taxRateBps?: number;
  locationLabel?: string;
}) {
  const router = useRouter();
  const [roomId, setRoomId] = useState(rooms[0]?.id || "");
  const room = useMemo(() => rooms.find((x) => x.id === roomId) || rooms[0], [rooms, roomId]);
  const applicableAddons = useMemo(
    () => addons.filter((x) => !x.roomId || x.roomId === roomId),
    [addons, roomId],
  );
  const [selectedAddons, setSelectedAddons] = useState<Record<string, number>>({});
  const [date, setDate] = useState(initialDate || defaultDate());
  const [durationHours, setDurationHours] = useState(
    Math.max(room?.minimumHours || 1, initialDurationHours || 1),
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    if (!room) return;
    setDurationHours((current) => Math.max(room.minimumHours, current));
    setSelectedAddons((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => applicableAddons.some((x) => x.id === id)),
      ),
    );
  }, [room, applicableAddons]);

  useEffect(() => {
    if (!roomId || !date) return;
    const controller = new AbortController();
    setLoading(true);
    setSelected("");
    setMessage("");

    fetch(
      `/api/availability?roomId=${encodeURIComponent(roomId)}&date=${encodeURIComponent(date)}&durationMinutes=${durationHours * 60}`,
      { signal: controller.signal },
    )
      .then((r) => r.json())
      .then((data) => {
        const next = Array.isArray(data.slots) ? data.slots : [];
        setSlots(next);
        if (initialStartAt && next.some((slot: Slot) => slot.startAt === initialStartAt)) {
          setSelected(initialStartAt);
        }
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setSlots([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [roomId, date, durationHours, initialStartAt]);

  async function book() {
    if (!selected) return;

    if (!userRole) {
      router.push(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }

    if (userRole !== "CREATOR") {
      setMessage("Booking requires a Creator account.");
      return;
    }

    setBooking(true);
    setMessage("");

    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId,
        startAt: selected,
        durationMinutes: durationHours * 60,
        addons: Object.entries(selectedAddons).map(([addonId, quantity]) => ({
          addonId,
          quantity,
        })),
        promoCode: promoCode.trim(),
      }),
    });

    const data = await response.json().catch(() => ({}));
    setBooking(false);

    if (!response.ok) {
      setMessage(data.error || "Booking failed.");
      return;
    }

    router.push(data.redirectTo || "/creator/bookings");
    router.refresh();
  }

  if (!room) {
    return <p className="text-sm text-zinc-500">No bookable room is available.</p>;
  }

  const roomTotal = room.hourlyRateMad * durationHours;
  const addonTotal = applicableAddons.reduce(
    (sum, addon) => sum + addon.unitPriceMad * (selectedAddons[addon.id] || 0),
    0,
  );
  const subtotal = roomTotal + addonTotal;
  const estimatedTax = Math.round((subtotal * taxRateBps) / 10000);
  const estimatedTotal = subtotal + estimatedTax;
  const estimatedDeposit = Math.round((estimatedTotal * depositPercent) / 100);

  return (
    <div>
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <span className="text-2xl font-black">{room.hourlyRateMad} MAD</span>
          <span className="ml-1 text-sm text-zinc-500">/ hour</span>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-zinc-600">
          Live availability
        </span>
      </div>

      <div className="relative overflow-visible rounded-2xl border border-zinc-700 bg-[#0c0d0b]">
        <label className="block border-b border-zinc-800 px-4 py-3">
          <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">
            Studio room
          </span>
          <select
            className="mt-1 w-full appearance-none bg-transparent text-sm font-semibold text-white outline-none"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
          >
            {rooms.map((item) => (
              <option key={item.id} value={item.id} className="bg-zinc-950">
                {item.name} · {item.hourlyRateMad} MAD/h
              </option>
            ))}
          </select>
        </label>

        {locationLabel && (
          <div className="border-b border-zinc-800 px-4 py-3">
            <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">
              Location
            </span>
            <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-white">
              <span className="text-acid">⌖</span>
              <span>{locationLabel}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2">
          <button
            type="button"
            onClick={() => setCalendarOpen((open) => !open)}
            className="border-r border-zinc-800 px-4 py-3 text-left transition hover:bg-zinc-900/60"
          >
            <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">
              Date
            </span>
            <span className="mt-1 block text-sm font-semibold text-white">{friendlyDate(date)}</span>
          </button>

          <label className="px-4 py-3">
            <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">
              Duration
            </span>
            <select
              className="mt-1 w-full appearance-none bg-transparent text-sm font-semibold text-white outline-none"
              value={durationHours}
              onChange={(e) => setDurationHours(Number(e.target.value))}
            >
              {Array.from(
                { length: Math.max(1, 13 - room.minimumHours) },
                (_, i) => room.minimumHours + i,
              )
                .filter((hours) => hours <= 12)
                .map((hours) => (
                  <option key={hours} value={hours} className="bg-zinc-950">
                    {hours} hour{hours === 1 ? "" : "s"}
                  </option>
                ))}
            </select>
          </label>
        </div>

        {calendarOpen && (
          <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-[320px] sm:w-[360px]">
            <DateCalendar
              value={date}
              min={today}
              onChange={(value) => {
                setDate(value);
                setCalendarOpen(false);
              }}
            />
          </div>
        )}
      </div>

      <div className="mt-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black">Choose a start time</span>
          <span className="text-[10px] text-zinc-600">Casablanca time</span>
        </div>

        {loading ? (
          <p className="mt-3 text-xs text-zinc-600">Checking live availability…</p>
        ) : slots.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-zinc-800 p-4 text-xs leading-5 text-zinc-600">
            No available {durationHours}h slot for this date.
          </p>
        ) : (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {slots.map((slot) => (
              <button
                key={slot.startAt}
                type="button"
                onClick={() => setSelected(slot.startAt)}
                className={[
                  "rounded-xl border px-3 py-2.5 text-xs font-bold transition",
                  selected === slot.startAt
                    ? "border-acid bg-acid text-black"
                    : "border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-600",
                ].join(" ")}
              >
                {slot.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {applicableAddons.length > 0 && (
        <details className="mt-5 rounded-xl border border-zinc-900 bg-black/20 p-4">
          <summary className="cursor-pointer text-xs font-black text-zinc-300">
            Add extras
          </summary>
          <div className="mt-3 space-y-2">
            {applicableAddons.map((addon) => {
              const qty = selectedAddons[addon.id] || 0;
              return (
                <div
                  key={addon.id}
                  className={`rounded-xl border p-3 ${qty ? "border-acid/40 bg-acid/[0.03]" : "border-zinc-900"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 accent-[#d9ff43]"
                        checked={qty > 0}
                        onChange={(e) =>
                          setSelectedAddons((current) => ({
                            ...current,
                            [addon.id]: e.target.checked ? 1 : 0,
                          }))
                        }
                      />
                      <span>
                        <b className="block text-xs">{addon.name}</b>
                        <span className="mt-1 block text-[10px] leading-4 text-zinc-600">
                          {addon.description || `${addon.unitPriceMad} MAD / ${addon.unitLabel}`}
                        </span>
                      </span>
                    </label>
                    <b className="text-xs text-acid">+{addon.unitPriceMad} MAD</b>
                  </div>
                  {qty > 0 && (
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <span className="text-[10px] text-zinc-600">Qty</span>
                      <select
                        className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs"
                        value={qty}
                        onChange={(e) =>
                          setSelectedAddons((current) => ({
                            ...current,
                            [addon.id]: Number(e.target.value),
                          }))
                        }
                      >
                        {[1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </details>
      )}

      <div className="mt-5">
        <input
          className="field"
          value={promoCode}
          onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
          maxLength={32}
          placeholder="Promo code (optional)"
        />
      </div>

      <button
        type="button"
        disabled={!selected || booking}
        onClick={book}
        className="mt-4 w-full rounded-xl bg-acid px-5 py-4 text-sm font-black text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
      >
        {booking ? "Reserving…" : !userRole ? "Log in to reserve" : "Reserve"}
      </button>

      <p className="mt-3 text-center text-[10px] text-zinc-600">
        You won&apos;t be charged until the payment step.
      </p>

      {message && <p className="mt-3 text-xs leading-5 text-amber-300">{message}</p>}

      <div className="mt-5 space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-500">
            {room.hourlyRateMad} MAD × {durationHours}h
          </span>
          <span>{roomTotal} MAD</span>
        </div>
        {addonTotal > 0 && (
          <div className="flex justify-between">
            <span className="text-zinc-500">Add-ons</span>
            <span>{addonTotal} MAD</span>
          </div>
        )}
        {estimatedTax > 0 && (
          <div className="flex justify-between">
            <span className="text-zinc-500">Estimated tax</span>
            <span>{estimatedTax} MAD</span>
          </div>
        )}
        <div className="flex justify-between border-t border-zinc-800 pt-3 font-black">
          <span>Total</span>
          <span>{estimatedTotal} MAD</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-500">Deposit due ({depositPercent}%)</span>
          <b className="text-acid">{estimatedDeposit} MAD</b>
        </div>
      </div>
    </div>
  );
}
