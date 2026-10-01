"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "36-compare-studios-v1";
const EVENT_NAME = "36:compare-change";
const MAX_COMPARE = 4;

type CompareItem = {
  id: string;
  name: string;
};

function readItems(): CompareItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is CompareItem =>
          item &&
          typeof item.id === "string" &&
          typeof item.name === "string",
      )
      .slice(0, MAX_COMPARE);
  } catch {
    return [];
  }
}

function writeItems(items: CompareItem[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: items }));
}

export function CompareStudioButton({
  studioId,
  studioName,
}: {
  studioId: string;
  studioName: string;
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

  const selected = items.some((item) => item.id === studioId);
  const full = items.length >= MAX_COMPARE && !selected;

  function toggle() {
    const current = readItems();
    const exists = current.some((item) => item.id === studioId);
    const next = exists
      ? current.filter((item) => item.id !== studioId)
      : current.length < MAX_COMPARE
        ? [...current, { id: studioId, name: studioName }]
        : current;
    writeItems(next);
    setItems(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={full}
      title={full ? "Compare up to 4 studios" : undefined}
      className={
        "rounded-full border px-3 py-1.5 text-[10px] font-black transition " +
        (selected
          ? "border-acid/40 bg-acid/[0.05] text-acid"
          : full
            ? "cursor-not-allowed border-[#ebebeb] text-[#b8b8b8]"
            : "border-[#dddddd] text-[#717171] hover:border-[#bdbdbd] hover:text-[#222222]")
      }
    >
      {selected ? "✓ Comparing" : full ? "Compare full" : "+ Compare"}
    </button>
  );
}
