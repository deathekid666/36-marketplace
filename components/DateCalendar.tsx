"use client";

import { useMemo, useState } from "react";

function parseDateValue(value?: string) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function toDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthCells(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const cells: Array<Date | null> = Array.from({ length: firstWeekday }, () => null);
  for (let day = 1; day <= days; day += 1) cells.push(new Date(year, monthIndex, day));
  while (cells.length % 7) cells.push(null);
  return cells;
}

function monthTitle(month: Date) {
  return new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(month);
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
      <div className="air-calendar-month-title">{monthTitle(month)}</div>
      <div className="air-calendar-weekdays">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="air-calendar-days">
        {days.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} className="air-calendar-empty" />;
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
              aria-label={availabilityKnown ? `${dateValue}, ${slotCount} available start ${slotCount === 1 ? "time" : "times"}` : dateValue}
              className={[
                "air-calendar-day",
                isSelected ? "air-calendar-day-selected" : "",
                isToday && !isSelected ? "air-calendar-day-today" : "",
                isDisabled ? "air-calendar-day-disabled" : "",
              ].join(" ")}
            >
              <span>{day.getDate()}</span>
              {availabilityKnown && slotCount! > 0 && !isSelected && <i />}
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
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));
  const nextMonth = useMemo(() => new Date(month.getFullYear(), month.getMonth() + 1, 1), [month]);

  const minMonth = minimum ? new Date(minimum.getFullYear(), minimum.getMonth(), 1) : null;
  const maxMonth = maximum ? new Date(maximum.getFullYear(), maximum.getMonth(), 1) : null;
  const canGoBack = !minMonth || month.getTime() > minMonth.getTime();
  const furthestVisibleMonth = twoMonths ? nextMonth : month;
  const canGoForward = !maxMonth || furthestVisibleMonth.getTime() < maxMonth.getTime();
  const todayValue = toDateValue(new Date());
  const nextAvailable = availability
    ? Object.entries(availability)
        .filter(([key, count]) => count > 0 && key >= (min || todayValue))
        .sort(([a], [b]) => a.localeCompare(b))[0]?.[0] || null
    : null;

  function jumpTo(value: string) {
    const target = parseDateValue(value);
    if (!target) return;
    setMonth(new Date(target.getFullYear(), target.getMonth(), 1));
    onChange(value);
  }

  function shiftMonth(delta: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  return (
    <div className="air-calendar">
      <div className="air-calendar-inner">
        <button type="button" onClick={() => shiftMonth(-1)} disabled={!canGoBack} className="air-calendar-nav air-calendar-prev" aria-label="Previous month">←</button>
        <button type="button" onClick={() => shiftMonth(1)} disabled={!canGoForward} className="air-calendar-nav air-calendar-next" aria-label="Next month">→</button>

        <div className={twoMonths ? "flex gap-8 sm:gap-10" : "flex"}>
          <CalendarMonth month={month} value={value} minimum={minimum} maximum={maximum} availability={availability} loadingAvailability={loadingAvailability} onChange={onChange} />
          {twoMonths && (
            <CalendarMonth second month={nextMonth} value={value} minimum={minimum} maximum={maximum} availability={availability} loadingAvailability={loadingAvailability} onChange={onChange} />
          )}
        </div>
      </div>

      {(footer || availability) && (
        <div className="air-calendar-footer">
          <div>
            {availability && (
              <>
                <span><i className="air-calendar-dot" />Available</span>
                <span>Unavailable dates are disabled</span>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {minimum && todayValue >= toDateValue(minimum) && (!maximum || todayValue <= toDateValue(maximum)) && (
              <button type="button" onClick={() => jumpTo(todayValue)} className="rounded-full border border-[#dddddd] px-3 py-1.5 text-[10px] font-black text-[#555]">
                Today
              </button>
            )}
            {nextAvailable && nextAvailable !== value && (
              <button type="button" onClick={() => jumpTo(nextAvailable)} className="rounded-full border border-[#dddddd] px-3 py-1.5 text-[10px] font-black text-[#222]">
                Next available
              </button>
            )}
            {footer}
          </div>
        </div>
      )}
    </div>
  );
}
