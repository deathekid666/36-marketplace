"use client";

import { useMemo, useState } from "react";

export type DirectoryLocationOption = {
  key: string;
  label: string;
  city: string;
  countryCode: string;
  lat: number | null;
  lng: number | null;
  count: number;
};

export function DirectoryLocationPicker({
  options,
  defaultCity,
  defaultCountryCode,
  defaultLat,
  defaultLng,
  defaultRadius,
  mapAreaActive,
}: {
  options: DirectoryLocationOption[];
  defaultCity: string;
  defaultCountryCode: string;
  defaultLat: number | null;
  defaultLng: number | null;
  defaultRadius: number | null;
  mapAreaActive: boolean;
}) {
  const initial = useMemo(() => {
    if (mapAreaActive) return "Map area";
    if (defaultCity) {
      return (
        options.find(
          (option) =>
            option.city.toLowerCase() === defaultCity.toLowerCase() &&
            (!defaultCountryCode || option.countryCode === defaultCountryCode),
        )?.label ||
        [defaultCity, defaultCountryCode].filter(Boolean).join(", ")
      );
    }
    if (defaultCountryCode) {
      return (
        options.find(
          (option) =>
            !option.city && option.countryCode === defaultCountryCode,
        )?.label || defaultCountryCode
      );
    }
    return "";
  }, [defaultCity, defaultCountryCode, mapAreaActive, options]);

  const [value, setValue] = useState(initial);
  const [city, setCity] = useState(defaultCity);
  const [countryCode, setCountryCode] = useState(defaultCountryCode);
  const [lat, setLat] = useState<number | null>(defaultLat);
  const [lng, setLng] = useState<number | null>(defaultLng);
  const [open, setOpen] = useState(false);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    const pool = q && q !== "map area"
      ? options.filter((option) => option.label.toLowerCase().includes(q))
      : options;
    return pool.slice(0, 10);
  }, [options, value]);

  function clearSelection(nextValue: string) {
    setValue(nextValue);
    setCity("");
    setCountryCode("");
    setLat(null);
    setLng(null);
    setOpen(true);
  }

  function choose(option: DirectoryLocationOption) {
    setValue(option.label);
    setCity(option.city);
    setCountryCode(option.countryCode);
    setLat(option.lat);
    setLng(option.lng);
    setOpen(false);
  }

  return (
    <div className="relative rounded-2xl border-t border-[#ebebeb] px-4 py-2 lg:border-l lg:border-t-0">
      <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-[#8a8a8a]">
        Location
      </span>
      <input
        value={value}
        onChange={(event) => clearSelection(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        placeholder="City or country"
        autoComplete="off"
        className="mt-1 w-full bg-transparent text-sm font-semibold text-white outline-none placeholder:text-[#a3a3a3]"
        aria-label="Studio location"
      />
      <input type="hidden" name="city" value={city} />
      <input type="hidden" name="country" value={countryCode} />
      <input type="hidden" name="lat" value={lat == null ? "" : String(lat)} />
      <input type="hidden" name="lng" value={lng == null ? "" : String(lng)} />

      {open && matches.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-[1200] overflow-hidden rounded-2xl border border-[#dddddd] bg-white shadow-2xl">
          {matches.map((option) => (
            <button
              key={option.key}
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(option)}
              className="flex w-full items-center justify-between gap-3 border-b border-[#ebebeb] px-4 py-3 text-left last:border-b-0 hover:bg-[#f3f3f3]"
            >
              <span className="min-w-0">
                <b className="block truncate text-sm text-[#222222]">
                  {option.label}
                </b>
                <span className="text-[10px] uppercase tracking-[0.1em] text-[#8a8a8a]">
                  {option.city ? "City" : "Country"}
                </span>
              </span>
              <span className="shrink-0 text-xs font-bold text-[#8a8a8a]">
                {option.count}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2">
        <span className="text-[10px] font-black uppercase tracking-[0.1em] text-[#a3a3a3]">
          Radius
        </span>
        <select
          name="radius"
          defaultValue={defaultRadius == null ? "" : String(defaultRadius)}
          disabled={lat == null || lng == null}
          className="bg-transparent text-[11px] font-bold text-[#555555] outline-none disabled:text-[#b8b8b8]"
          title={lat == null || lng == null ? "Choose a city to use radius search" : "Radius"}
        >
          <option value="" className="bg-white">Any</option>
          <option value="5" className="bg-white">5 km</option>
          <option value="10" className="bg-white">10 km</option>
          <option value="25" className="bg-white">25 km</option>
          <option value="50" className="bg-white">50 km</option>
          <option value="100" className="bg-white">100 km</option>
        </select>
      </div>
    </div>
  );
}
