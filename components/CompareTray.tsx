"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "36-compare-studios-v1";
const EVENT_NAME = "36:compare-change";

type CompareItem = {
  id: string;
  name: string;
};

function readItems(): CompareItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 4) : [];
  } catch {
    return [];
  }
}

export function CompareTray({
  date,
  durationHours,
}: {
  date: string;
  durationHours: number;
}) {
  const [items, setItems] = useState<CompareItem[]>([]);

  useEffect(() => {
    const sync = () => setItems(readItems());
    sync();
    window.addEventListener(EVENT_NAME, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT_NAME, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const href = useMemo(() => {
    const params = new URLSearchParams();
    params.set(
      "ids",
      items
        .map((item) => item.id)
        .slice(0, 4)
        .join(","),
    );
    if (date) params.set("date", date);
    params.set("duration", String(durationHours));
    return "/studios/compare?" + params.toString();
  }, [items, date, durationHours]);

  if (items.length === 0) return null;

  function clear() {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: [] }));
    setItems([]);
  }

  return (
    <div className="fixed bottom-4 left-1/2 z-[80] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 rounded-2xl border border-[#cfcfcf] bg-white/95 p-4 shadow-[0_22px_70px_rgba(0,0,0,.65)] backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <span className="text-[10px] font-black uppercase tracking-[0.12em] text-acid">
            Compare studios
          </span>
          <div className="mt-2 flex flex-wrap gap-2">
            {items.map((item) => (
              <span
                key={item.id}
                className="max-w-44 truncate rounded-full border border-[#dddddd] px-3 py-1 text-[10px] font-bold text-[#333333]"
                title={item.name}
              >
                {item.name}
              </span>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={clear}
            className="text-xs font-bold text-[#8a8a8a] hover:text-[#222222]"
          >
            Clear
          </button>
          {items.length >= 2 ? (
            <Link
              href={href}
              className="rounded-xl bg-acid px-4 py-3 text-xs font-black text-white"
            >
              Compare {items.length} →
            </Link>
          ) : (
            <span className="rounded-xl border border-[#dddddd] px-4 py-3 text-xs font-black text-[#8a8a8a]">
              Select one more
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
