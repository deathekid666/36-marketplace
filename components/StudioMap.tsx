"use client";

import { useEffect, useRef } from "react";

type Point = { id: string; name: string; lat: number; lng: number; href: string; price?: number | null };

declare global {
  interface Window { L?: any }
}

export function StudioMap({ points }: { points: Point[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || points.length === 0) return;
    let map: any;
    let cancelled = false;
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
          const existing = document.querySelector('script[data-leaflet="36"]') as HTMLScriptElement | null;
          if (existing) {
            existing.addEventListener("load", () => resolve(), { once: true });
            existing.addEventListener("error", () => reject(new Error("Map library failed")), { once: true });
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
      map = L.map(ref.current, { scrollWheelZoom: false, attributionControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);
      const bounds = L.latLngBounds([]);
      points.forEach((point) => {
        const marker = L.marker([point.lat, point.lng]).addTo(map);
        marker.bindPopup(`<strong>${escapeHtml(point.name)}</strong>${point.price ? `<br>${point.price} MAD/h` : ""}<br><a href="${point.href}">Open studio</a>`);
        bounds.extend([point.lat, point.lng]);
      });
      if (points.length === 1) map.setView([points[0].lat, points[0].lng], 14);
      else map.fitBounds(bounds.pad(0.18));
    };
    load().catch(() => undefined);
    return () => { cancelled = true; if (map) map.remove(); };
  }, [points]);
  if (!points.length) return null;
  return <div ref={ref} className="h-[360px] w-full overflow-hidden rounded-2xl border border-zinc-900 bg-zinc-950" aria-label="Studio locations map" />;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] || char));
}
