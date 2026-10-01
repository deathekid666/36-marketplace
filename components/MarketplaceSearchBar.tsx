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
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(y, m - 1, d));
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
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
    <form action="/studios" method="GET" className="air-search-wrap">
      <input type="hidden" name="date" value={selectedDate} />

      <div className="air-search-bar">
        <label className="air-search-segment air-search-where">
          <b>Where</b>
          <input
            name="city"
            defaultValue={city}
            placeholder="Search destinations"
            list="studio-location-suggestions"
          />
        </label>

        <button
          type="button"
          onClick={() => setCalendarOpen((open) => !open)}
          className="air-search-segment"
        >
          <b>When</b>
          <span>{friendlyDate(selectedDate)}</span>

          {calendarOpen && (
            <div className="air-search-calendar" onClick={(event) => event.stopPropagation()}>
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

        <label className="air-search-segment">
          <b>Duration</b>
          <select name="duration" defaultValue={String(durationHours)}>
            {[1, 2, 3, 4, 5, 6, 8, 10, 12].map((hours) => (
              <option key={hours} value={hours}>
                {hours} hour{hours === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </label>

        <label className="air-search-segment">
          <b>Studio type</b>
          <select name="category" defaultValue={category || ""}>
            <option value="">Any studio</option>
            {categories.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
        </label>

        <button className="air-search-button" type="submit">
          <SearchIcon />
          <span>Search</span>
        </button>
      </div>

      <details
        className="air-filter-panel"
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
        <summary>
          <span>Filters</span>
          <small>Price · capacity · equipment · rating</small>
        </summary>

        <div className="air-filter-grid">
          <label><span>Min price · MAD/h</span><input className="field" type="number" min="1" name="minPrice" defaultValue={minPrice || ""} placeholder="Any" /></label>
          <label><span>Max price · MAD/h</span><input className="field" type="number" min="1" name="maxPrice" defaultValue={maxPrice || ""} placeholder="Any" /></label>
          <label><span>Minimum capacity</span><input className="field" type="number" min="1" max="500" name="capacity" defaultValue={capacity || ""} placeholder="Any" /></label>
          <label>
            <span>Minimum rating</span>
            <select className="field" name="minRating" defaultValue={minRating ? String(minRating) : ""}>
              <option value="">Any rating</option>
              <option value="3">3.0+</option>
              <option value="4">4.0+</option>
              <option value="4.5">4.5+</option>
            </select>
          </label>
          <label><span>Equipment</span><input className="field" name="equipment" defaultValue={equipment} maxLength={100} placeholder="Microphone, piano…" /></label>
          <label><span>Amenity</span><input className="field" name="amenity" defaultValue={amenity} maxLength={100} placeholder="Wi-Fi, parking…" /></label>
          <label>
            <span>Sort by</span>
            <select className="field" name="sort" defaultValue={sort}>
              <option value="recommended">Recommended</option>
              <option value="price_asc">Price · low to high</option>
              <option value="price_desc">Price · high to low</option>
              <option value="rating_desc">Rating · highest first</option>
              <option value="popular">Popularity</option>
              <option value="capacity_desc">Capacity · largest first</option>
            </select>
          </label>
          <label className="air-check-filter">
            <input type="checkbox" name="engineer" value="1" defaultChecked={engineerIncluded} />
            <span>Engineer included</span>
          </label>
        </div>

        <div className="air-filter-footer">
          <span>Advanced filters apply to verified, bookable inventory.</span>
          <a href="/studios">Clear all</a>
        </div>
      </details>

      {selectedDate && (
        <button type="button" onClick={() => setSelectedDate("")} className="air-clear-date">
          Clear date
        </button>
      )}

      <datalist id="studio-location-suggestions">
        {locationSuggestions.map((location) => <option key={location} value={location} />)}
      </datalist>
    </form>
  );
}
