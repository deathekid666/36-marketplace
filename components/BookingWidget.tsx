"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { DateCalendar } from "@/components/DateCalendar";
import { formatMoney } from "@/lib/commerce";
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
  currency: string;
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

function dateValueInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";
  return [get("year"), get("month"), get("day")].join("-");
}

function addDateDays(value: string, days: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return [
    String(date.getUTCFullYear()).padStart(4, "0"),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function defaultDate(timeZone: string) {
  return addDateDays(dateValueInTimeZone(new Date(), timeZone), 1);
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

function friendlyStartTime(startAt: string, timeZone: string) {
  if (!startAt) return "Choose time";
  return new Intl.DateTimeFormat("en", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(startAt));
}

export function BookingWidget({
  rooms,
  addons = [],
  userRole,
  isOwnStudio = false,
  depositPercent,
  initialDate,
  initialDurationHours,
  initialStartAt,
  taxRateBps = 0,
  locationLabel,
  freeCancellationHours = 24,
  timeZone = "Africa/Casablanca",
  currency = "MAD",
}: {
  rooms: RoomOption[];
  addons?: AddonOption[];
  userRole?: "CREATOR" | "STUDIO_OWNER" | "ADMIN" | null;
  isOwnStudio?: boolean;
  depositPercent: number;
  initialDate?: string;
  initialDurationHours?: number;
  initialStartAt?: string;
  taxRateBps?: number;
  locationLabel?: string;
  freeCancellationHours?: number;
  timeZone?: string;
  currency?: string;
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
  const [date, setDate] = useState(
    initialDate || defaultDate(timeZone),
  );
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
  const [notes, setNotes] = useState("");
  const [acceptedPolicies, setAcceptedPolicies] = useState(false);

  const today = useMemo(
    () => dateValueInTimeZone(new Date(), timeZone),
    [timeZone],
  );
  const maxDate = useMemo(
    () => addDateDays(today, 119),
    [today],
  );

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

  function bookingReturnPath() {
    const params = new URLSearchParams();
    params.set("date", date);
    params.set("duration", String(durationHours));
    if (selected) params.set("startAt", selected);
    return (
      window.location.pathname +
      (params.toString() ? "?" + params.toString() : "")
    );
  }

  async function reviewCheckout() {
    if (!selected) {
      setCalendarOpen(true);
      return;
    }

    if (!userRole) {
      router.push(
        "/auth/login?next=" +
          encodeURIComponent(bookingReturnPath()),
      );
      return;
    }

    if (userRole === "ADMIN") {
      router.push("/admin/test-marketplace");
      return;
    }

    if (isOwnStudio) {
      setMessage(
        "This is your studio. Use the owner calendar to manage availability instead of booking it as a customer.",
      );
      return;
    }

    setQuoteLoading(true);
    setMessage("");

    try {
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

      if (!response.ok || !data.quote) {
        setQuote(null);
        setMessage(
          data.error ||
            "Unable to review this booking. Please choose another time and try again.",
        );
        return;
      }

      setQuote(data.quote as BookingQuote);
      setAcceptedPolicies(false);
      setCheckoutOpen(true);
    } catch {
      setQuote(null);
      setMessage(
        "The booking review could not be loaded. Check your connection and try again.",
      );
    } finally {
      setQuoteLoading(false);
    }
  }

  async function book() {
    if (!quote) {
      await reviewCheckout();
      return;
    }

    setBooking(true);
    setMessage("");

    try {
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
          notes: notes.trim(),
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setCheckoutOpen(false);
        setQuote(null);
        setMessage(
          data.error ||
            "Booking failed. Your slot was not confirmed.",
        );
        return;
      }

      const bookingId = String(data.bookingId || "");
      const destination =
        typeof data.redirectTo === "string" && data.redirectTo.startsWith("/")
          ? data.redirectTo
          : bookingId
            ? "/creator/bookings/" + bookingId + "?booked=1"
            : "/creator/bookings";

      // Booking creation has already succeeded on the server. Use a hard
      // navigation so the reservation hub always loads even if the current
      // App Router tree is stale or a client transition gets interrupted.
      window.location.assign(destination);
      return;
    } catch {
      setCheckoutOpen(false);
      setQuote(null);
      setMessage(
        "The booking could not be confirmed. No booking was created. Please try again.",
      );
    } finally {
      setBooking(false);
    }
  }

  if (!room) {
    return <p className="text-sm text-[#717171]">No bookable room is available.</p>;
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
      <div className="air-booking-flow">
        <div className="air-booking-flow-head">
          <div>
            <span>1 · Choose a room</span>
            <b>{room.name}</b>
          </div>
          <small>Live availability</small>
        </div>

        <div className="air-booking-room-list">
          {rooms.map((item) => {
            const active = item.id === roomId;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setRoomId(item.id)}
                className={active ? "active" : ""}
              >
                <span>
                  <b>{item.name}</b>
                  <small>
                    Minimum {item.minimumHours}h
                    {item.engineerIncluded ? " · Engineer included" : ""}
                  </small>
                </span>
                <strong>{formatMoney(item.hourlyRateMad, currency)}/h</strong>
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl border border-[#cfcfcf] bg-white overflow-hidden">

        {locationLabel && (
          <div className="border-b border-[#dddddd] px-4 py-3">
            <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-[#717171]">
              Location
            </span>
            <div className="mt-1 flex items-center gap-2 text-sm font-semibold text-[#222222]">
              <span className="text-acid">⌖</span>
              <span>{locationLabel}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2">
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            className="px-4 py-3 text-left transition hover:bg-[#f7f7f7]"
          >
            <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-[#717171]">
              2 · Date
            </span>
            <span className="mt-1 block text-sm font-semibold text-[#222222]">
              {friendlyDate(date)}
            </span>
          </button>

          <label className="border-l border-[#dddddd] px-4 py-3">
            <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-[#717171]">
              Duration
            </span>
            <select
              className="mt-1 w-full appearance-none bg-transparent text-sm font-semibold text-[#222222] outline-none"
              value={durationHours}
              onChange={(event) => setDurationHours(Number(event.target.value))}
            >
              {Array.from(
                { length: Math.max(1, 13 - room.minimumHours) },
                (_, index) => room.minimumHours + index,
              )
                .filter((hours) => hours <= 12)
                .map((hours) => (
                  <option key={hours} value={hours} className="bg-white">
                    {hours} hour{hours === 1 ? "" : "s"}
                  </option>
                ))}
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={() => setCalendarOpen(true)}
          className="flex w-full items-center justify-between border-t border-[#dddddd] px-4 py-3 text-left transition hover:bg-[#f7f7f7]"
        >
          <span>
            <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-[#717171]">
              3 · Start time
            </span>
            <span
              className={
                "mt-1 block text-sm font-semibold " +
                (selected ? "text-[#222222]" : "text-[#8a8a8a]")
              }
            >
              {loading
                ? "Checking availability…"
                : selected
                  ? friendlyStartTime(selected, timeZone)
                  : slots.length
                    ? "Choose after selecting date"
                    : "No times available"}
            </span>
          </span>
          <span className="text-xs text-[#8a8a8a]">studio local time · {timeZone}</span>
        </button>
      </div>
      </div>

      {calendarOpen && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Close calendar"
            className="absolute inset-0"
            onClick={() => setCalendarOpen(false)}
          />

          <div className="relative z-10 w-full max-w-[760px] rounded-t-[30px] bg-white sm:rounded-[30px]">
            <div className="flex items-center justify-between px-5 pt-5 sm:px-6">
              <div>
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a8a8a]">
                  Select date
                </span>
                <h3 className="mt-1 text-xl font-black">
                  When do you want the studio?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setCalendarOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-full border border-[#dddddd] text-sm text-[#555555] hover:bg-[#f3f3f3] hover:text-[#222222]"
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
                today={today}
                twoMonths
                availability={calendarAvailability}
                loadingAvailability={calendarLoading}
                onChange={(value) => {
                  setDate(value);
                  setSelected("");
                }}
                footer={
                  <span className="text-[10px] text-[#8a8a8a]">
                    {calendarLoading
                      ? "Loading live dates…"
                      : "120-day booking window · " + timeZone}
                  </span>
                }
              />
            </div>

            <div className="border-t border-[#ebebeb] px-5 py-4 sm:px-6">
              <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                <label>
                  <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[#8a8a8a]">
                    Available start time · {friendlyDate(date)}
                  </span>
                  <select
                    className="mt-2 w-full rounded-xl border border-[#dddddd] bg-white px-4 py-3 text-sm font-semibold text-[#222222] outline-none disabled:text-[#a3a3a3]"
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
                  className="rounded-xl bg-[#222] px-6 py-3 text-sm font-black text-white transition hover:bg-[#111] disabled:cursor-not-allowed disabled:bg-[#e6e6e6] disabled:text-[#9a9a9a]"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-[#ebebeb] bg-[#f7f7f7] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a8a8a]">
              Your session
            </span>
            <p className="mt-1 text-sm font-semibold">
              {friendlyDate(date)}
              {selected ? " · " + friendlyStartTime(selected, timeZone) : ""}
              {" · " + durationHours + "h"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCalendarOpen(true)}
            className="text-xs font-black text-[#222222] underline decoration-zinc-600 underline-offset-4"
          >
            Change
          </button>
        </div>
      </div>

      {applicableAddons.length > 0 && (
        <details className="mt-5 rounded-xl border border-[#ebebeb] bg-[#f7f7f7] p-4">
          <summary className="cursor-pointer text-xs font-black text-[#333333]">
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
                      : "border-[#ebebeb]")
                  }
                >
                  <div className="flex items-start justify-between gap-3">
                    <label className="flex cursor-pointer items-start gap-3">
                      <input
                        type="checkbox"
                        className="mt-1 accent-[#D9FF43]"
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
                        <span className="mt-1 block text-[10px] leading-4 text-[#8a8a8a]">
                          {addon.description ||
                            formatMoney(addon.unitPriceMad, currency) + " / " + addon.unitLabel}
                        </span>
                      </span>
                    </label>
                    <b className="text-xs text-acid">
                      +{formatMoney(addon.unitPriceMad, currency)}
                    </b>
                  </div>

                  {qty > 0 && (
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <span className="text-[10px] text-[#8a8a8a]">Qty</span>
                      <select
                        className="rounded-lg border border-[#dddddd] bg-white px-2 py-1 text-xs"
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

      {message && (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-[#f3d59b] bg-[#fff8e8] p-4 text-xs leading-5 text-[#7a5514]"
        >
          <p>{message}</p>
        </div>
      )}

      <button
        type="button"
        disabled={booking || quoteLoading || isOwnStudio}
        onClick={reviewCheckout}
        className="mt-4 w-full rounded-xl bg-acid px-5 py-4 text-sm font-black text-[#111] transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-[#e6e6e6] disabled:text-[#9a9a9a]"
      >
        {quoteLoading
          ? "Checking price…"
          : !selected
            ? "Choose date & time"
            : !userRole
              ? "Log in to reserve"
              : userRole === "ADMIN"
                ? "Open Creator test setup"
                : isOwnStudio
                  ? "Your studio"
                  : "Review & reserve"}
      </button>

      <p className="mt-3 text-center text-[10px] text-[#8a8a8a]">
        {userRole === "ADMIN"
          ? "Admin accounts do not create marketplace bookings. Use the controlled Creator test account."
          : isOwnStudio
            ? "Manage this listing and its availability from your host dashboard."
            : "Exact price and availability are verified by 36 before confirmation. No online payment is required."}
      </p>

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

          <section className="relative z-10 max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-[30px] border border-[#dddddd] bg-white p-5 shadow-[0_24px_70px_rgba(0,0,0,.22)] sm:rounded-[30px] sm:p-6">
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
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#dddddd] text-[#555555] hover:bg-[#f3f3f3] hover:text-[#222222] disabled:opacity-30"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-[#ebebeb] bg-[#f7f7f7] p-4">
                <span className="label">Room</span>
                <b className="text-sm">{quote.roomName}</b>
              </div>
              <div className="rounded-2xl border border-[#ebebeb] bg-[#f7f7f7] p-4">
                <span className="label">Session</span>
                <b className="text-sm">
                  {friendlyDate(date)} · {friendlyStartTime(quote.startAt, timeZone)}
                </b>
                <span className="mt-1 block text-[10px] text-[#8a8a8a]">
                  {quote.durationMinutes / 60}h · studio local time · {timeZone}
                </span>
              </div>
            </div>

            <div className="mt-5 space-y-3 rounded-2xl border border-[#dddddd] bg-white p-4 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-[#717171]">
                  {formatMoney(quote.hourlyRateMad, quote.currency)} × {quote.durationMinutes / 60}h
                </span>
                <b>{formatMoney(quote.baseAmountMad, quote.currency)}</b>
              </div>

              {quote.addons.map((addon) => (
                <div
                  key={addon.addonId}
                  className="flex justify-between gap-4"
                >
                  <span className="text-[#717171]">
                    {addon.name} × {addon.quantity}
                  </span>
                  <b>{formatMoney(addon.totalMad, quote.currency)}</b>
                </div>
              ))}

              {quote.promoDiscountMad > 0 && (
                <div className="flex justify-between gap-4 text-emerald-600">
                  <span>Promo {quote.promoCode}</span>
                  <b>-{formatMoney(quote.promoDiscountMad, quote.currency)}</b>
                </div>
              )}

              {quote.taxAmountMad > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-[#717171]">Tax</span>
                  <b>{formatMoney(quote.taxAmountMad, quote.currency)}</b>
                </div>
              )}

              <div className="flex justify-between gap-4 border-t border-[#dddddd] pt-3 text-base font-black">
                <span>Total</span>
                <span>{formatMoney(quote.totalAmountMad, quote.currency)}</span>
              </div>
            </div>

            <div className="mt-5">
              <label>
                <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a8a8a]">
                  Session notes
                </span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={1200}
                  rows={3}
                  placeholder="Tell the studio what you are creating, arrival needs, setup requests or anything they should prepare."
                  className="mt-3 w-full resize-none rounded-2xl border border-[#dddddd] bg-white px-4 py-3 text-sm leading-6 text-[#222] outline-none focus:border-[#bdbdbd]"
                />
                <span className="mt-1 block text-right text-[9px] text-[#a3a3a3]">
                  {notes.length}/1200
                </span>
              </label>
            </div>

            <div className="mt-5">
              <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8a8a8a]">
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
                        : "border-[#ebebeb] bg-[#f7f7f7] hover:border-[#cfcfcf]")
                    }
                  >
                    <input
                      type="radio"
                      name="offlinePaymentMethod"
                      value={method.value}
                      checked={paymentMethod === method.value}
                      onChange={() => setPaymentMethod(method.value)}
                      className="mt-1 accent-[#D9FF43]"
                    />
                    <span>
                      <b className="block text-sm">{method.label}</b>
                      <span className="mt-1 block text-xs leading-5 text-[#8a8a8a]">
                        {method.description}
                      </span>
                    </span>
                  </label>
                ))}

                <div className="rounded-2xl border border-dashed border-[#dddddd] p-4 opacity-50">
                  <b className="text-sm text-[#717171]">Online payment</b>
                  <p className="mt-1 text-xs leading-5 text-[#a3a3a3]">
                    Coming later. No paid gateway is required to operate 36 now.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-acid/25 bg-acid/[0.035] p-4">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a8a8a]">
                    Online payment due now
                  </span>
                  <b className="mt-1 block text-2xl text-acid">
                    {formatMoney(0, quote.currency)}
                  </b>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a8a8a]">
                    Pay directly to studio
                  </span>
                  <b className="mt-1 block text-sm">
                    {formatMoney(quote.totalAmountMad, quote.currency)}
                  </b>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-[#d8e8dc] bg-[#f4faf5] p-4 text-xs leading-5 text-[#5f6f63]">
              This booking confirms immediately with {selectedPayment.label.toLowerCase()}.
              36 records the amount as pending until the studio marks the payment received.
              No card processor or paid payment service is used.
            </div>

            <div className="mt-3 rounded-2xl border border-[#ebebeb] bg-[#f7f7f7] p-4">
              <div className="grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-[#8a8a8a]">
                    Cancellation
                  </span>
                  <b className="mt-1 block">
                    Free up to {freeCancellationHours}h before the session
                  </b>
                </div>
                <div>
                  <span className="block text-[9px] font-black uppercase tracking-[0.12em] text-[#8a8a8a]">
                    Studio deposit policy
                  </span>
                  <b className="mt-1 block">{depositPercent}%</b>
                </div>
              </div>
            </div>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-[#dddddd] p-4">
              <input
                type="checkbox"
                checked={acceptedPolicies}
                onChange={(event) => setAcceptedPolicies(event.target.checked)}
                className="mt-0.5 accent-[#D9FF43]"
              />
              <span className="text-xs leading-5 text-[#717171]">
                I confirm the date, room, payment method and studio cancellation policy shown above.
              </span>
            </label>

            <button
              type="button"
              disabled={booking || !acceptedPolicies}
              onClick={book}
              className="mt-5 w-full rounded-xl bg-acid px-5 py-4 text-sm font-black text-[#111] transition hover:brightness-95 disabled:cursor-not-allowed disabled:bg-[#e6e6e6] disabled:text-[#9a9a9a]"
            >
              {booking
                ? "Confirming booking…"
                : "Confirm booking · " + selectedPayment.label}
            </button>

            <p className="mt-3 text-center text-[10px] text-[#8a8a8a]">
              36 rechecks availability and the quoted total at confirmation.
            </p>
          </section>
        </div>
      )}

      <div className="mt-5 border-t border-[#ebebeb] pt-4">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a8a8a]">
            Price summary
          </span>
          <span className="text-[10px] text-[#8a8a8a]">Before confirmation</span>
        </div>
        <div className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-[#717171]">
            {formatMoney(room.hourlyRateMad, currency)} × {durationHours}h
          </span>
          <span>{formatMoney(roomTotal, currency)}</span>
        </div>

        {addonTotal > 0 && (
          <div className="flex justify-between">
            <span className="text-[#717171]">Add-ons</span>
            <span>{formatMoney(addonTotal, currency)}</span>
          </div>
        )}

        {estimatedTax > 0 && (
          <div className="flex justify-between">
            <span className="text-[#717171]">Estimated tax</span>
            <span>{formatMoney(estimatedTax, currency)}</span>
          </div>
        )}

        <div className="flex justify-between border-t border-[#dddddd] pt-3 font-black">
          <span>Total</span>
          <span>{formatMoney(estimatedTotal, currency)}</span>
        </div>

        <div className="flex justify-between text-xs">
          <span className="text-[#717171]">
            Payment
          </span>
          <b className="text-[#222]">Pay directly to studio</b>
        </div>
        </div>
      </div>
    </div>
  );
}
