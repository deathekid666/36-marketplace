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

export function DateCalendar({
  value,
  onChange,
  min,
}: {
  value: string;
  onChange: (value: string) => void;
  min?: string;
}) {
  const selected = parseDateValue(value);
  const minimum = parseDateValue(min);
  const initial = selected || minimum || new Date();
  const [month, setMonth] = useState(() => new Date(initial.getFullYear(), initial.getMonth(), 1));

  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    const cells: Array<Date | null> = [];
    for (let i = 0; i < first.getDay(); i += 1) cells.push(null);
    for (let day = 1; day <= last.getDate(); day += 1) {
      cells.push(new Date(month.getFullYear(), month.getMonth(), day));
    }
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [month]);

  const minMonth = minimum
    ? new Date(minimum.getFullYear(), minimum.getMonth(), 1)
    : null;
  const canGoBack = !minMonth || month.getTime() > minMonth.getTime();

  function shiftMonth(delta: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));
  }

  return (
    <div className="rounded-3xl border border-zinc-800 bg-[#11120f] p-4 shadow-2xl">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          disabled={!canGoBack}
          className="grid h-9 w-9 place-items-center rounded-full border border-zinc-800 text-zinc-300 transition hover:border-zinc-600 disabled:cursor-not-allowed disabled:opacity-30"
          aria-label="Previous month"
        >
          ←
        </button>
        <b className="text-sm">
          {new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(month)}
        </b>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          className="grid h-9 w-9 place-items-center rounded-full border border-zinc-800 text-zinc-300 transition hover:border-zinc-600"
          aria-label="Next month"
        >
          →
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 text-center text-[10px] font-bold uppercase tracking-[0.08em] text-zinc-600">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((day) => (
          <span key={day} className="py-2">
            {day}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} className="aspect-square" />;

          const dateValue = toDateValue(day);
          const isSelected = dateValue === value;
          const isPast = Boolean(minimum && day.getTime() < minimum.getTime());
          const isToday = dateValue === toDateValue(new Date());

          return (
            <button
              key={dateValue}
              type="button"
              disabled={isPast}
              onClick={() => onChange(dateValue)}
              className={[
                "aspect-square rounded-full text-xs font-bold transition",
                isSelected
                  ? "bg-acid text-black"
                  : "text-zinc-300 hover:bg-zinc-800",
                isToday && !isSelected ? "ring-1 ring-zinc-600" : "",
                isPast ? "cursor-not-allowed text-zinc-800 hover:bg-transparent" : "",
              ].join(" ")}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
