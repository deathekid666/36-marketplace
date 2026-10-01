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
  minPrice,
  maxPrice,
  capacity,
  engineerIncluded,
  equipment,
  amenity,
  minRating,
  sort,
  categories,
  locationSuggestions,
}: {
  category?: string;
  city: string;
  date: string;
  durationHours: number;
  minPrice?: number;
  maxPrice?: number;
  capacity?: number;
  engineerIncluded: boolean;
  equipment: string;
  amenity: string;
  minRating?: number;
  sort: string;
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
            <span className={"mt-1 block text-sm font-semibold " + (selectedDate ? "text-white" : "text-zinc-600")}>
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

      <details
        className="mt-3 rounded-2xl border border-zinc-900 bg-zinc-950/50"
        open={Boolean(
          minPrice ||
            maxPrice ||
            capacity ||
            engineerIncluded ||
            equipment ||
            amenity ||
            minRating ||
            (sort && sort !== "recommended"),
        )}
      >
        <summary className="cursor-pointer list-none px-4 py-3 text-xs font-black text-zinc-400">
          Advanced filters
          <span className="ml-2 text-zinc-700">
            price · capacity · equipment · amenities · rating
          </span>
        </summary>

        <div className="grid gap-3 border-t border-zinc-900 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label>
            <span className="label">Min price · MAD/h</span>
            <input
              className="field"
              type="number"
              min="1"
              name="minPrice"
              defaultValue={minPrice || ""}
              placeholder="Any"
            />
          </label>
          <label>
            <span className="label">Max price · MAD/h</span>
            <input
              className="field"
              type="number"
              min="1"
              name="maxPrice"
              defaultValue={maxPrice || ""}
              placeholder="Any"
            />
          </label>
          <label>
            <span className="label">Minimum capacity</span>
            <input
              className="field"
              type="number"
              min="1"
              max="500"
              name="capacity"
              defaultValue={capacity || ""}
              placeholder="Any"
            />
          </label>
          <label>
            <span className="label">Minimum rating</span>
            <select
              className="field"
              name="minRating"
              defaultValue={minRating ? String(minRating) : ""}
            >
              <option value="">Any rating</option>
              <option value="3">3.0+</option>
              <option value="4">4.0+</option>
              <option value="4.5">4.5+</option>
            </select>
          </label>
          <label>
            <span className="label">Equipment</span>
            <input
              className="field"
              name="equipment"
              defaultValue={equipment}
              maxLength={100}
              placeholder="Neumann, piano, monitors…"
            />
          </label>
          <label>
            <span className="label">Amenity</span>
            <input
              className="field"
              name="amenity"
              defaultValue={amenity}
              maxLength={100}
              placeholder="Wi-Fi, lounge, parking…"
            />
          </label>
          <label>
            <span className="label">Sort by</span>
            <select
              className="field"
              name="sort"
              defaultValue={sort}
            >
              <option value="recommended">Recommended</option>
              <option value="price_asc">Price · low to high</option>
              <option value="price_desc">Price · high to low</option>
              <option value="rating_desc">Rating · highest first</option>
              <option value="popular">Popularity</option>
              <option value="capacity_desc">Capacity · largest first</option>
            </select>
          </label>
          <label className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs font-bold text-zinc-300">
            <input
              type="checkbox"
              name="engineer"
              value="1"
              defaultChecked={engineerIncluded}
              className="accent-[#d9ff43]"
            />
            Engineer included
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-900 px-4 py-3">
          <span className="text-[10px] leading-5 text-zinc-700">
            Advanced filters apply to verified, bookable studio inventory only.
          </span>
          <a
            href="/studios"
            className="text-[10px] font-black text-zinc-500 hover:text-white"
          >
            Clear all filters
          </a>
        </div>
      </details>

      <div className="mt-3 flex flex-wrap items-center gap-3 px-3">
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
