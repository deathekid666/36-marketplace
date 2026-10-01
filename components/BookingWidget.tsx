"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { DateCalendar } from "@/components/DateCalendar";
import {
  OFFLINE_PAYMENT_METHODS,
  type OfflinePaymentMethod,
} from "@/lib/offline-payment";

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

type BookingQuote = {
  roomId: string;
  roomName: string;
  hourlyRateMad: number;
  startAt: string;
  endAt: string;
  durationMinutes: number;
  baseAmountMad: number;
  addons: Array<{
    addonId: string;
    name: string;
    unitPriceMad: number;
    quantity: number;
    totalMad: number;
  }>;
  addonTotalMad: number;
  promoCode: string;
  promoDiscountMad: number;
  discountedSubtotalMad: number;
  taxBps: number;
  taxAmountMad: number;
  totalAmountMad: number;
  depositPercent: number;
  depositAmountMad: number;
  balanceAmountMad: number;
  holdMinutes: number;
};

function toLocalDateValue(date: Date) {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function defaultDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return toLocalDateValue(date);
}

function friendlyDate(value: string) {
  const parts = value.split("-").map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return "Choose date";

  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

function friendlyStartTime(startAt: string) {
  if (!startAt) return "Choose time";
  return new Intl.DateTimeFormat("en", {
    timeZone: "Africa/Casablanca",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(startAt));
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
  const room = useMemo(
    () => rooms.find((item) => item.id === roomId) || rooms[0],
    [rooms, roomId],
  );
  const applicableAddons = useMemo(
    () => addons.filter((item) => !item.roomId || item.roomId === roomId),
    [addons, roomId],
  );

  const [selectedAddons, setSelectedAddons] = useState<Record<string, number>>({});
  const [date, setDate] = useState(initialDate || defaultDate());
  const [durationHours, setDurationHours] = useState(
    Math.max(room?.minimumHours || 1, initialDurationHours || 1),
  );
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarAvailability, setCalendarAvailability] = useState<Record<string, number>>({});
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [quote, setQuote] = useState<BookingQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] =
    useState<OfflinePaymentMethod>("PAY_AT_STUDIO");

  const today = useMemo(() => toLocalDateValue(new Date()), []);
  const maxDate = useMemo(() => {
    const value = new Date();
    value.setDate(value.getDate() + 119);
    return toLocalDateValue(value);
  }, []);

  useEffect(() => {
    if (!room) return;

    setDurationHours((current) => Math.max(room.minimumHours, current));
    setSelectedAddons((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) =>
          applicableAddons.some((item) => item.id === id),
        ),
      ),
    );
  }, [room, applicableAddons]);

  useEffect(() => {
    if (!roomId) return;

    const controller = new AbortController();
    setCalendarLoading(true);

    const params = new URLSearchParams({
      roomId,
      startDate: today,
      days: "120",
      durationMinutes: String(durationHours * 60),
    });

    fetch("/api/availability/calendar?" + params.toString(), {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data) => {
        const dates =
          data && typeof data.dates === "object" && data.dates ? data.dates : {};
        setCalendarAvailability(dates);
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setCalendarAvailability({});
      })
      .finally(() => setCalendarLoading(false));

    return () => controller.abort();
  }, [roomId, durationHours, today]);

  useEffect(() => {
    if (!roomId || !date) return;

    const controller = new AbortController();
    setLoading(true);
    setSelected("");
    setMessage("");

    const params = new URLSearchParams({
      roomId,
      date,
      durationMinutes: String(durationHours * 60),
    });

    fetch("/api/availability?" + params.toString(), {
      signal: controller.signal,
    })
      .then((response) => response.json())
      .then((data) => {
        const next = Array.isArray(data.slots) ? data.slots : [];
        setSlots(next);

        if (
          initialStartAt &&
          next.some((slot: Slot) => slot.startAt === initialStartAt)
        ) {
          setSelected(initialStartAt);
        }
      })
      .catch((error) => {
        if (error?.name !== "AbortError") setSlots([]);
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [roomId, date, durationHours, initialStartAt]);

  function selectedAddonPayload() {
    return Object.entries(selectedAddons)
      .filter(([, quantity]) => quantity > 0)
      .map(([addonId, quantity]) => ({
        addonId,
        quantity,
      }));
  }

  async function reviewCheckout() {
    if (!selected) {
      setCalendarOpen(true);
      return;
    }

    if (!userRole) {
      router.push(
        "/auth/login?next=" + encodeURIComponent(window.location.pathname),
      );
      return;
    }

    if (userRole !== "CREATOR") {
      setMessage("Booking requires a Creator account.");
      return;
    }

    setQuoteLoading(true);
    setMessage("");

    const response = await fetch("/api/bookings/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId,
        startAt: selected,
        durationMinutes: durationHours * 60,
        addons: selectedAddonPayload(),
        promoCode: promoCode.trim(),
      }),
    });

    const data = await response.json().catch(() => ({}));
    setQuoteLoading(false);

    if (!response.ok || !data.quote) {
      setQuote(null);
      setMessage(data.error || "Unable to review this booking.");
      return;
    }

    setQuote(data.quote as BookingQuote);
    setCheckoutOpen(true);
  }

  async function book() {
    if (!quote) {
      await reviewCheckout();
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
        addons: selectedAddonPayload(),
        promoCode: promoCode.trim(),
        expectedTotalMad: quote.totalAmountMad,
        paymentMethod,
      }),
    });

    const data = await response.json().catch(() => ({}));
    setBooking(false);

    if (!response.ok) {
      setCheckoutOpen(false);
      setQuote(null);
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
    (sum, addon) =>
      sum + addon.unitPriceMad * (selectedAddons[addon.id] || 0),
    0,
  );
  const subtotal = roomTotal + addonTotal;
  const estimatedTax = Math.round((subtotal * taxRateBps) / 10000);
  const estimatedTotal = subtotal + estimatedTax;
  const selectedPayment =
    OFFLINE_PAYMENT_METHODS.find(
      (method) => method.value === paymentMethod,
    ) || OFFLINE_PAYMENT_METHODS[0];

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

      <div className="rounded-2xl border border-zinc-700 bg-[#0c0d0b]">
        <label className="block border-b border-zinc-800 px-4 py-3">
          <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">
            Studio room
          </span>
          <select
            className="mt-1 w-full appearance-none bg-transparent text-sm font-semibold text-white outline-none"
            value={roomId}
            onChange={(event) => setRoomId(event.target.value)}
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
            onClick={() => setCalendarOpen(true)}
            className="px-4 py-3 text-left transition hover:bg-zinc-900/60"
          >
            <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">
              Date
            </span>
            <span className="mt-1 block text-sm font-semibold text-white">
              {friendlyDate(date)}
            </span>
          </button>

          <label className="border-l border-zinc-800 px-4 py-3">
            <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">
              Duration
            </span>
            <select
              className="mt-1 w-full appearance-none bg-transparent text-sm font-semibold text-white outline-none"
              value={durationHours}
              onChange={(event) => setDurationHours(Number(event.target.value))}
            >
              {Array.from(
                { length: Math.max(1, 13 - room.minimumHours) },
                (_, index) => room.minimumHours + index,
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

        <button
          type="button"
          onClick={() => setCalendarOpen(true)}
          className="flex w-full items-center justify-between border-t border-zinc-800 px-4 py-3 text-left transition hover:bg-zinc-900/60"
        >
          <span>
            <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500">
              Start time
            </span>
            <span
              className={
                "mt-1 block text-sm font-semibold " +
                (selected ? "text-white" : "text-zinc-600")
              }
            >
              {loading
                ? "Checking availability…"
                : selected
                  ? friendlyStartTime(selected)
                  : slots.length
                    ? "Choose after selecting date"
                    : "No times available"}
            </span>
          </span>
          <span className="text-xs text-zinc-600">Casablanca time</span>
        </button>
      </div>

      {calendarOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Close calendar"
            className="absolute inset-0"
            onClick={() => setCalendarOpen(false)}
          />

          <div className="relative z-10 w-full max-w-[760px] rounded-t-[30px] bg-[#11120f] sm:rounded-[30px]">
            <div className="flex items-center justify-between px-5 pt-5 sm:px-6">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-600">
                  Select date
                </span>
                <h3 className="mt-1 text-xl font-black">
                  When do you want the studio?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCalendarOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-full border border-zinc-800 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-white"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="p-3 sm:p-4">
              <DateCalendar
                value={date}
                min={today}
                max={maxDate}
                twoMonths
                availability={calendarAvailability}
                loadingAvailability={calendarLoading}
                onChange={(value) => {
                  setDate(value);
                  setSelected("");
                }}
                footer={
                  <span className="text-[10px] text-zinc-600">
                    {calendarLoading
                      ? "Loading live dates…"
                      : "120-day booking window · Casablanca time"}
                  </span>
                }
              />
            </div>

            <div className="border-t border-zinc-900 px-5 py-4 sm:px-6">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <label>
                  <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
                    Available start time · {friendlyDate(date)}
                  </span>
                  <select
                    className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm font-semibold text-white outline-none disabled:text-zinc-700"
                    value={selected}
                    disabled={loading || slots.length === 0}
                    onChange={(event) => setSelected(event.target.value)}
                  >
                    <option value="">
                      {loading
                        ? "Checking times…"
                        : slots.length
                          ? "Select a start time"
                          : "No start times for this date"}
                    </option>
                    {slots.map((slot) => (
                      <option key={slot.startAt} value={slot.startAt}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  type="button"
                  disabled={!selected}
                  onClick={() => setCalendarOpen(false)}
                  className="rounded-xl bg-white px-6 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-zinc-900 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
              Your session
            </span>
            <p className="mt-1 text-sm font-semibold">
              {friendlyDate(date)}
              {selected ? " · " + friendlyStartTime(selected) : ""}
              {" · " + durationHours + "h"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            className="text-xs font-black text-white underline decoration-zinc-600 underline-offset-4"
          >
            Change
          </button>
        </div>
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
                  className={
                    "rounded-xl border p-3 " +
                    (qty
                      ? "border-acid/40 bg-acid/[0.03]"
                      : "border-zinc-900")
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 accent-[#d9ff43]"
                        checked={qty > 0}
                        onChange={(event) =>
                          setSelectedAddons((current) => ({
                            ...current,
                            [addon.id]: event.target.checked ? 1 : 0,
                          }))
                        }
                      />
                      <span>
                        <b className="block text-xs">{addon.name}</b>
                        <span className="mt-1 block text-[10px] leading-4 text-zinc-600">
                          {addon.description ||
                            addon.unitPriceMad + " MAD / " + addon.unitLabel}
                        </span>
                      </span>
                    </label>
                    <b className="text-xs text-acid">
                      +{addon.unitPriceMad} MAD
                    </b>
                  </div>

                  {qty > 0 && (
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <span className="text-[10px] text-zinc-600">Qty</span>
                      <select
                        className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs"
                        value={qty}
                        onChange={(event) =>
                          setSelectedAddons((current) => ({
                            ...current,
                            [addon.id]: Number(event.target.value),
                          }))
                        }
                      >
                        {[1, 2, 3, 4, 5].map((number) => (
                          <option key={number} value={number}>
                            {number}
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
          onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
          maxLength={32}
          placeholder="Promo code (optional)"
        />
      </div>

      <button
        type="button"
        disabled={booking || quoteLoading}
        onClick={reviewCheckout}
        className="mt-4 w-full rounded-xl bg-acid px-5 py-4 text-sm font-black text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
      >
        {quoteLoading
          ? "Checking price…"
          : !selected
            ? "Choose date & time"
            : !userRole
              ? "Log in to reserve"
              : "Review & reserve"}
      </button>

      <p className="mt-3 text-center text-[10px] text-zinc-600">
        Exact price and availability are verified by 36 before confirmation. No online payment is required.
      </p>

      {message && (
        <p className="mt-3 text-xs leading-5 text-amber-300">{message}</p>
      )}

      {checkoutOpen && quote && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Close checkout"
            className="absolute inset-0"
            onClick={() => {
              if (!booking) setCheckoutOpen(false);
            }}
          />

          <section className="relative z-10 max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-[30px] border border-zinc-800 bg-[#11120f] p-5 shadow-[0_32px_100px_rgba(0,0,0,.65)] sm:rounded-[30px] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-acid">
                  Review booking
                </span>
                <h3 className="mt-2 text-2xl font-black">
                  Confirm your studio session
                </h3>
              </div>
              <button
                type="button"
                disabled={booking}
                onClick={() => setCheckoutOpen(false)}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-white disabled:opacity-30"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-zinc-900 bg-black/20 p-4">
                <span className="label">Room</span>
                <b className="text-sm">{quote.roomName}</b>
              </div>
              <div className="rounded-2xl border border-zinc-900 bg-black/20 p-4">
                <span className="label">Session</span>
                <b className="text-sm">
                  {friendlyDate(date)} · {friendlyStartTime(quote.startAt)}
                </b>
                <span className="mt-1 block text-[10px] text-zinc-600">
                  {quote.durationMinutes / 60}h · Casablanca time
                </span>
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-zinc-500">
                  {quote.hourlyRateMad} MAD × {quote.durationMinutes / 60}h
                </span>
                <b>{quote.baseAmountMad} MAD</b>
              </div>

              {quote.addons.map((addon) => (
                <div
                  key={addon.addonId}
                  className="flex justify-between gap-4"
                >
                  <span className="text-zinc-500">
                    {addon.name} × {addon.quantity}
                  </span>
                  <b>{addon.totalMad} MAD</b>
                </div>
              ))}

              {quote.promoDiscountMad > 0 && (
                <div className="flex justify-between gap-4 text-emerald-300">
                  <span>Promo {quote.promoCode}</span>
                  <b>-{quote.promoDiscountMad} MAD</b>
                </div>
              )}

              {quote.taxAmountMad > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-zinc-500">Tax</span>
                  <b>{quote.taxAmountMad} MAD</b>
                </div>
              )}

              <div className="flex justify-between gap-4 border-t border-zinc-800 pt-3 text-base font-black">
                <span>Total</span>
                <span>{quote.totalAmountMad} MAD</span>
              </div>
            </div>

            <div className="mt-5">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-zinc-600">
                Payment method
              </span>
              <div className="mt-3 space-y-2">
                {OFFLINE_PAYMENT_METHODS.map((method) => (
                  <label
                    key={method.value}
                    className={
                      "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition " +
                      (paymentMethod === method.value
                        ? "border-acid/40 bg-acid/[0.035]"
                        : "border-zinc-900 bg-black/20 hover:border-zinc-700")
                    }
                  >
                    <input
                      type="radio"
                      name="offlinePaymentMethod"
                      value={method.value}
                      checked={paymentMethod === method.value}
                      onChange={() => setPaymentMethod(method.value)}
                      className="mt-1 accent-[#d9ff43]"
                    />
                    <span>
                      <b className="block text-sm">{method.label}</b>
                      <span className="mt-1 block text-xs leading-5 text-zinc-600">
                        {method.description}
                      </span>
                    </span>
                  </label>
                ))}

                <div className="rounded-2xl border border-dashed border-zinc-800 p-4 opacity-50">
                  <b className="text-sm text-zinc-500">Online payment</b>
                  <p className="mt-1 text-xs leading-5 text-zinc-700">
                    Coming later. No paid gateway is required to operate 36 now.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-acid/25 bg-acid/[0.035] p-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
                    Online payment due now
                  </span>
                  <b className="mt-1 block text-2xl text-acid">
                    0 MAD
                  </b>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-zinc-600">
                    Pay directly to studio
                  </span>
                  <b className="mt-1 block text-sm">
                    {quote.totalAmountMad} MAD
                  </b>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-emerald-900/35 bg-emerald-950/10 p-4 text-xs leading-5 text-zinc-500">
              This booking confirms immediately with {selectedPayment.label.toLowerCase()}.
              36 records the amount as pending until the studio marks the payment received.
              No card processor or paid payment service is used.
            </div>

            <button
              type="button"
              disabled={booking}
              onClick={book}
              className="mt-5 w-full rounded-xl bg-acid px-5 py-4 text-sm font-black text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600"
            >
              {booking
                ? "Confirming booking…"
                : "Confirm booking · " + selectedPayment.label}
            </button>

            <p className="mt-3 text-center text-[10px] text-zinc-600">
              36 rechecks availability and the quoted total at confirmation.
            </p>
          </section>
        </div>
      )}

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
          <span className="text-zinc-500">
            Payment
          </span>
          <b className="text-acid">Pay directly to studio</b>
        </div>
      </div>
    </div>
  );
}
