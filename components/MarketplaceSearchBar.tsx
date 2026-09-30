"use client";

import { useMemo, useState } from "react";

import { DateCalendar } from "@/components/DateCalendar";

type CategoryOption = {
  value: string;
  label: string;
};

function friendlyDate(value: string) {
  if (!value) return "Add date";
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return "Add date";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(y, m - 1, d));
}

export function MarketplaceSearchBar({
  category,
  city,
  date,
  durationHours,
  maxPrice,
  categories,
  locationSuggestions,
}: {
  category?: string;
  city: string;
  date: string;
  durationHours: number;
  maxPrice?: number;
  categories: CategoryOption[];
  locationSuggestions: string[];
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(date);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  return (
    <form action="/studios" method="GET" className="mt-8">
      <input type="hidden" name="date" value={selectedDate} />

      <div className="rounded-[2rem] border border-zinc-800 bg-[#11120f] p-2 shadow-2xl">
        <div className="grid lg:grid-cols-[1.35fr_1fr_1fr_1fr_auto]">
          <label className="group rounded-[1.45rem] px-5 py-3 transition hover:bg-zinc-900/80">
            <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
              Where
            </span>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-zinc-600">⌖</span>
              <input
                className="w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-zinc-700"
                name="city"
                defaultValue={city}
                placeholder="Search destinations"
                list="studio-location-suggestions"
              />
            </div>
          </label>

          <button
            type="button"
            onClick={() => setCalendarOpen((open) => !open)}
            className="relative rounded-[1.45rem] border-t border-zinc-900 px-5 py-3 text-left transition hover:bg-zinc-900/80 lg:border-l lg:border-t-0"
          >
            <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
              When
            </span>
            <span className={`mt-1 block text-sm font-semibold ${selectedDate ? "text-white" : "text-zinc-600"}`}>
              {friendlyDate(selectedDate)}
            </span>

            {calendarOpen && (
              <div
                className="absolute left-0 top-[calc(100%+12px)] z-50 w-[320px] sm:w-[360px]"
                onClick={(event) => event.stopPropagation()}
              >
                <DateCalendar
                  value={selectedDate}
                  min={today}
                  onChange={(value) => {
                    setSelectedDate(value);
                    setCalendarOpen(false);
                  }}
                />
              </div>
            )}
          </button>

          <label className="rounded-[1.45rem] border-t border-zinc-900 px-5 py-3 transition hover:bg-zinc-900/80 lg:border-l lg:border-t-0">
            <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
              Duration
            </span>
            <select
              name="duration"
              defaultValue={String(durationHours)}
              className="mt-1 w-full appearance-none bg-transparent text-sm font-semibold text-white outline-none"
            >
              {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((hours) => (
                <option key={hours} value={hours} className="bg-zinc-950">
                  {hours} hour{hours === 1 ? "" : "s"}
                </option>
              ))}
            </select>
          </label>

          <label className="rounded-[1.45rem] border-t border-zinc-900 px-5 py-3 transition hover:bg-zinc-900/80 lg:border-l lg:border-t-0">
            <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-zinc-500">
              Studio type
            </span>
            <select
              name="category"
              defaultValue={category || ""}
              className="mt-1 w-full appearance-none bg-transparent text-sm font-semibold text-white outline-none"
            >
              <option value="" className="bg-zinc-950">
                Any studio
              </option>
              {categories.map((item) => (
                <option key={item.value} value={item.value} className="bg-zinc-950">
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center justify-center p-2 lg:justify-end">
            <button
              className="flex h-14 items-center gap-2 rounded-full bg-acid px-6 text-sm font-black text-black transition hover:brightness-110"
              type="submit"
            >
              <span className="text-lg">⌕</span>
              <span>Search</span>
            </button>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 px-3">
        <label className="flex items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-4 py-2 text-xs text-zinc-500">
          <span>Max price</span>
          <input
            className="w-20 bg-transparent font-bold text-zinc-200 outline-none placeholder:text-zinc-700"
            type="number"
            min="1"
            name="maxPrice"
            defaultValue={maxPrice || ""}
            placeholder="Any"
          />
          <span>MAD/h</span>
        </label>
        {selectedDate && (
          <button
            type="button"
            onClick={() => setSelectedDate("")}
            className="rounded-full border border-zinc-800 px-4 py-2 text-xs font-bold text-zinc-500 hover:text-white"
          >
            Clear date
          </button>
        )}
      </div>

      <datalist id="studio-location-suggestions">
        {locationSuggestions.map((location) => (
          <option key={location} value={location} />
        ))}
      </datalist>
    </form>
  );
}
