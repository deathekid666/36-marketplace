"use client";

import { useMemo, useState } from "react";

function toDateValue(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseDateValue(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const cells: Array<Date | null> = [];
  for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
  for (let day = 1; day <= last.getDate(); day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function monthTitle(month: Date) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(month);
}

function CalendarMonth({
  month,
  value,
  minimum,
  maximum,
  availability,
  loadingAvailability,
  onChange,
  second = false,
}: {
  month: Date;
  value: string;
  minimum: Date | null;
  maximum: Date | null;
  availability?: Record<string, number>;
  loadingAvailability?: boolean;
  onChange: (value: string) => void;
  second?: boolean;
}) {
  const days = useMemo(() => monthCells(month), [month]);

  return (
    <div className={second ? "hidden min-w-0 flex-1 sm:block" : "min-w-0 flex-1"}>
      <div className="h-9 text-center text-sm font-black">{monthTitle(month)}</div>

      <div className="mt-2 grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-600">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
          <span key={day} className="py-2">
            {day}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {days.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} className="h-11" />;

          const dateValue = toDateValue(day);
          const isSelected = dateValue === value;
          const isBeforeMin = Boolean(minimum && day.getTime() < minimum.getTime());
          const isAfterMax = Boolean(maximum && day.getTime() > maximum.getTime());
          const availabilityKnown = availability && Object.prototype.hasOwnProperty.call(availability, dateValue);
          const slotCount = availabilityKnown ? availability![dateValue] : undefined;
          const isUnavailable = Boolean(availabilityKnown && slotCount === 0);
          const isDisabled = isBeforeMin || isAfterMax || isUnavailable || Boolean(loadingAvailability && availability);
          const isToday = dateValue === toDateValue(new Date());

          return (
            <button
              key={dateValue}
              type="button"
              disabled={isDisabled}
              onClick={() => onChange(dateValue)}
              aria-label={
                availabilityKnown
                  ? `${dateValue}, ${slotCount} available start ${slotCount === 1 ? "time" : "times"}`
                  : dateValue
              }
              className={[
                "group relative mx-auto grid h-11 w-11 place-items-center rounded-full text-sm font-semibold transition",
                isSelected
                  ? "bg-white text-black"
                  : "text-zinc-200 hover:bg-zinc-800",
                isToday && !isSelected ? "ring-1 ring-zinc-600" : "",
                isDisabled
                  ? "cursor-not-allowed text-zinc-800 line-through decoration-zinc-700 hover:bg-transparent"
                  : "",
              ].join(" ")}
            >
              <span>{day.getDate()}</span>
              {availabilityKnown && slotCount! > 0 && !isSelected && (
                <span className="absolute bottom-1 h-1 w-1 rounded-full bg-acid" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateCalendar({
  value,
  onChange,
  min,
  max,
  twoMonths = false,
  availability,
  loadingAvailability = false,
  footer,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
  max?: string;
  twoMonths?: boolean;
  availability?: Record<string, number>;
  loadingAvailability?: boolean;
  footer?: React.ReactNode;
}) {
  const selected = parseDateValue(value);
  const minimum = parseDateValue(min);
  const maximum = parseDateValue(max);
  const initial = selected || minimum || new Date();
  const [month, setMonth] = useState(
    () => new Date(initial.getFullYear(), initial.getMonth(), 1),
  );

  const nextMonth = useMemo(
    () => new Date(month.getFullYear(), month.getMonth() + 1, 1),
    [month],
  );

  const minMonth = minimum
    ? new Date(minimum.getFullYear(), minimum.getMonth(), 1)
    : null;
  const maxMonth = maximum
    ? new Date(maximum.getFullYear(), maximum.getMonth(), 1)
    : null;

  const canGoBack = !minMonth || month.getTime() > minMonth.getTime();
  const furthestVisibleMonth = twoMonths ? nextMonth : month;
  const canGoForward = !maxMonth || furthestVisibleMonth.getTime() < maxMonth.getTime();

  function shiftMonth(delta: number) {
    setMonth(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + delta, 1),
    );
  }

  return (
    <div className="rounded-[28px] border border-zinc-800 bg-[#11120f] p-5 shadow-[0_28px_90px_rgba(0,0,0,.55)] sm:p-6">
      <div className="relative">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          disabled={!canGoBack}
          className="absolute left-0 top-0 z-10 grid h-9 w-9 place-items-center rounded-full text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-20"
          aria-label="Previous month"
        >
          ←
        </button>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          disabled={!canGoForward}
          className="absolute right-0 top-0 z-10 grid h-9 w-9 place-items-center rounded-full text-zinc-300 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-20"
          aria-label="Next month"
        >
          →
        </button>

        <div className={twoMonths ? "flex gap-8 sm:gap-10" : "flex"}>
          <CalendarMonth
            month={month}
            value={value}
            minimum={minimum}
            maximum={maximum}
            availability={availability}
            loadingAvailability={loadingAvailability}
            onChange={onChange}
          />
          {twoMonths && (
            <CalendarMonth
              second
              month={nextMonth}
              value={value}
              minimum={minimum}
              maximum={maximum}
              availability={availability}
              loadingAvailability={loadingAvailability}
              onChange={onChange}
            />
          )}
        </div>
      </div>

      {(footer || availability) && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-900 pt-4">
          <div className="flex items-center gap-4 text-[10px] text-zinc-600">
            {availability && (
              <>
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-acid" />
                  Available
                </span>
                <span className="flex items-center gap-2">
                  <span className="h-px w-3 bg-zinc-700" />
                  Unavailable dates are disabled
                </span>
              </>
            )}
          </div>
          {footer}
        </div>
      )}
    </div>
  );
}
