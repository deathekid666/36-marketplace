"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Point = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  href: string;
  price?: number | null;
};

declare global {
  interface Window {
    L?: any;
  }
}

type Bounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

export function StudioMap({
  points,
  searchArea = false,
}: {
  points: Point[];
  searchArea?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [areaBounds, setAreaBounds] = useState<Bounds | null>(null);

  useEffect(() => {
    if (!ref.current || points.length === 0) return;

    let map: any;
    let cancelled = false;
    let readyForAreaSearch = false;
    const markerById = new Map<string, any>();

    function highlightCard(studioId: string) {
      document
        .querySelectorAll<HTMLElement>("[data-directory-card]")
        .forEach((card) => {
          card.dataset.mapActive =
            card.dataset.studioId === studioId ? "true" : "false";
        });
    }

    const load = async () => {
      if (!document.querySelector('link[data-leaflet="36"]')) {
        const link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.dataset.leaflet = "36";
        document.head.appendChild(link);
      }

      if (!window.L) {
        await new Promise<void>((resolve, reject) => {
          const existing = document.querySelector(
            'script[data-leaflet="36"]',
          ) as HTMLScriptElement | null;

          if (existing) {
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener(
              "error",
              () => reject(new Error("Map library failed")),
              { once: true },
            );
            return;
          }

          const script = document.createElement("script");
          script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
          script.dataset.leaflet = "36";
          script.onload = () => resolve();
          script.onerror = () => reject(new Error("Map library failed"));
          document.body.appendChild(script);
        });
      }

      if (cancelled || !ref.current || !window.L) return;

      const L = window.L;
      map = L.map(ref.current, {
        scrollWheelZoom: false,
        attributionControl: true,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      const bounds = L.latLngBounds([]);

      points.forEach((point) => {
        const label = point.price ? `${point.price} MAD` : "36";
        const marker = L.marker([point.lat, point.lng], {
          icon: L.divIcon({
            className: "studio-map-marker-wrap",
            html: `<div class="studio-map-marker">${escapeHtml(label)}</div>`,
            iconSize: point.price ? [86, 38] : [46, 46],
            iconAnchor: point.price ? [43, 19] : [23, 23],
          }),
        }).addTo(map);

        marker.bindPopup(
          `<div class="studio-map-popup"><strong>${escapeHtml(point.name)}</strong>${
            point.price ? `<span>${point.price} MAD / hour</span>` : ""
          }<a href="${escapeHtml(point.href)}">View studio →</a></div>`,
        );

        marker.on("click", () => {
          highlightCard(point.id);
          document
            .querySelector<HTMLElement>(
              `[data-directory-card][data-studio-id="${cssEscape(point.id)}"]`,
            )
            ?.scrollIntoView({ behavior: "smooth", block: "center" });
        });

        markerById.set(point.id, marker);
        bounds.extend([point.lat, point.lng]);
      });

      if (points.length === 1) {
        map.setView([points[0].lat, points[0].lng], 14);
      } else {
        map.fitBounds(bounds.pad(0.18));
      }

      window.setTimeout(() => {
        readyForAreaSearch = true;
      }, 450);

      const captureBounds = () => {
        if (!searchArea || !readyForAreaSearch || !map) return;
        const next = map.getBounds();
        setAreaBounds({
          north: next.getNorth(),
          south: next.getSouth(),
          east: next.getEast(),
          west: next.getWest(),
        });
      };

      map.on("dragend", captureBounds);
      map.on("zoomend", captureBounds);

      const focusListener = (event: Event) => {
        const custom = event as CustomEvent<{ studioId?: string }>;
        const studioId = custom.detail?.studioId;
        if (!studioId) return;

        const marker = markerById.get(studioId);
        const point = points.find((item) => item.id === studioId);
        if (!marker || !point) return;

        highlightCard(studioId);
        readyForAreaSearch = false;
        map.setView([point.lat, point.lng], Math.max(map.getZoom(), 14), {
          animate: true,
        });
        marker.openPopup();
        window.setTimeout(() => {
          readyForAreaSearch = true;
        }, 450);
      };

      window.addEventListener("36:focus-studio", focusListener);

      return () => {
        window.removeEventListener("36:focus-studio", focusListener);
      };
    };

    let detach: (() => void) | undefined;
    load()
      .then((cleanup) => {
        detach = cleanup;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      detach?.();
      if (map) map.remove();
    };
  }, [points, searchArea]);

  function applyAreaSearch() {
    if (!areaBounds) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("north", areaBounds.north.toFixed(5));
    params.set("south", areaBounds.south.toFixed(5));
    params.set("east", areaBounds.east.toFixed(5));
    params.set("west", areaBounds.west.toFixed(5));
    params.delete("city");
    params.delete("country");
    params.delete("lat");
    params.delete("lng");
    params.delete("radius");
    params.delete("page");

    router.push("/discover?" + params.toString());
    setAreaBounds(null);
  }

  if (!points.length) return null;

  return (
    <div id="directory-map" className="relative">
      <div
        ref={ref}
        className="h-[520px] w-full overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950 xl:h-[680px]"
        aria-label="Studio locations map"
      />
      {searchArea && areaBounds && (
        <button
          type="button"
          onClick={applyAreaSearch}
          className="absolute left-1/2 top-4 z-[1000] -translate-x-1/2 rounded-full border border-zinc-700 bg-zinc-950/95 px-5 py-2.5 text-xs font-black text-white shadow-2xl backdrop-blur hover:border-sky-500 hover:text-sky-300"
        >
          Search this area
        </button>
      )}
    </div>
  );
}

function cssEscape(value: string) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>'"]/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[char] || char,
  );
}
