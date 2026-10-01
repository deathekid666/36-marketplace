"use client";

import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type StudioMapPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  href: string;
  price?: number | null;
  kind?: "BOOKABLE" | "CONTACT";
  category?: string | null;
  categoryKey?: string | null;
  rating?: number | null;
  photoUrl?: string | null;
  city?: string | null;
  countryCode?: string | null;
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

const CATEGORY_META: Record<string, { icon: string; color: string }> = {
  RECORDING: { icon: "●", color: "#ff2d67" },
  PODCAST: { icon: "◉", color: "#7c3cff" },
  PHOTO: { icon: "▣", color: "#2677ff" },
  VIDEO: { icon: "▶", color: "#ff8a00" },
  REHEARSAL: { icon: "♪", color: "#12b76a" },
  DJ: { icon: "⌁", color: "#111111" },
  PRODUCTION: { icon: "◆", color: "#111111" },
  IMAGE_LAB: { icon: "△", color: "#f5a300" },
  POST_PRODUCTION: { icon: "△", color: "#f5a300" },
  VOICE_OVER: { icon: "▮", color: "#1888ff" },
  LIVE_STREAMING: { icon: "◍", color: "#00a6a6" },
  OTHER: { icon: "•", color: "#555555" },
};

function metaFor(point: StudioMapPoint) {
  return CATEGORY_META[String(point.categoryKey || "OTHER")] || CATEGORY_META.OTHER;
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] || character,
  );
}

function cssEscape(value: string) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

function compactName(value: string) {
  const cleaned = value.trim();
  return cleaned.length > 24 ? cleaned.slice(0, 22) + "…" : cleaned;
}

function regionName(point: StudioMapPoint) {
  const { lat, lng } = point;
  if (lng < -30) return lat >= 10 ? "North America" : "South America";
  if (lng >= -30 && lng <= 60 && lat >= 35) return "Europe";
  if (lng >= -30 && lng <= 60 && lat < 35 && lat > -38) return "Africa";
  if (lng > 60 && lat >= -10) return "Asia";
  if (lng > 95 && lat < -10) return "Oceania";
  return "Middle East";
}

function countryLabel(code: string | null | undefined) {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return "Unknown";
  try {
    return (
      new Intl.DisplayNames(["en"], { type: "region" }).of(normalized) ||
      normalized
    );
  } catch {
    return normalized;
  }
}

function averageCenter(group: StudioMapPoint[]) {
  return {
    lat: group.reduce((sum, p) => sum + p.lat, 0) / group.length,
    lng: group.reduce((sum, p) => sum + p.lng, 0) / group.length,
  };
}

export function StudioMap({
  points,
  searchArea = false,
}: {
  points: StudioMapPoint[];
  searchArea?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [fullScreen, setFullScreen] = useState(false);
  const [areaBounds, setAreaBounds] = useState<Bounds | null>(null);
  const [directionsOpen, setDirectionsOpen] = useState(false);

  const navigationPoint = points.length === 1 ? points[0] : null;
  const googleMapsUrl = navigationPoint
    ? "https://www.google.com/maps/dir/?api=1&destination=" +
      encodeURIComponent(navigationPoint.lat + "," + navigationPoint.lng)
    : null;
  const wazeUrl = navigationPoint
    ? "https://www.waze.com/ul?ll=" +
      encodeURIComponent(navigationPoint.lat + "," + navigationPoint.lng) +
      "&navigate=yes"
    : null;

  useEffect(() => {
    if (!fullScreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFullScreen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [fullScreen]);

  useEffect(() => {
    if (!ref.current || points.length === 0) return;

    let map: any;
    let markerLayer: any;
    let cancelled = false;
    let readyForAreaSearch = false;
    const markerById = new Map<string, any>();

    function highlightCard(id: string) {
      document.querySelectorAll<HTMLElement>("[data-directory-card]").forEach((card) => {
        card.dataset.mapActive = card.dataset.studioId === id ? "true" : "false";
      });
    }

    function addPointMarker(L: any, point: StudioMapPoint) {
      const meta = metaFor(point);
      const isBookable = point.kind === "BOOKABLE";
      const label = isBookable && point.price
        ? point.price + " MAD"
        : meta.icon + " " + compactName(point.name);
      const width = Math.max(76, Math.min(170, 34 + label.length * 6.2));

      const marker = L.marker([point.lat, point.lng], {
        icon: L.divIcon({
          className: "studio-map-marker-wrap",
          html:
            '<div class="creative-map-pin ' +
            (isBookable ? "is-bookable" : "is-contact") +
            '" style="--pin-color:' + meta.color + '">' +
            '<span class="creative-map-pin-dot">' + escapeHtml(meta.icon) + "</span>" +
            '<b>' + escapeHtml(label) + "</b>" +
            "</div>",
          iconSize: [width, 40],
          iconAnchor: [Math.round(width / 2), 20],
        }),
      }).addTo(markerLayer);

      const photo = point.photoUrl
        ? '<img class="studio-map-popup-image" src="' +
          escapeHtml(point.photoUrl) +
          '" alt="" referrerpolicy="no-referrer" />'
        : "";

      marker.bindPopup(
        '<div class="creative-map-popup">' +
          photo +
          '<div class="creative-map-popup-copy">' +
          '<strong>' + escapeHtml(point.name) + "</strong>" +
          '<span>' +
          escapeHtml(
            [point.category || "", point.city || ""].filter(Boolean).join(" · "),
          ) +
          "</span>" +
          (point.rating
            ? '<span class="creative-map-rating">★ ' + point.rating.toFixed(1) + "</span>"
            : "") +
          (isBookable && point.price
            ? '<b>' + point.price + " MAD <small>/ hour</small></b>"
            : '<em>Contact only</em>') +
          '<div class="studio-map-popup-actions">' +
          '<a href="' + escapeHtml(point.href) + '">View details</a>' +
          '<a href="https://www.google.com/maps/dir/?api=1&destination=' +
          encodeURIComponent(point.lat + "," + point.lng) +
          '" target="_blank" rel="noreferrer">Directions ↗</a>' +
          "</div></div></div>",
      );

      marker.on("click", () => {
        highlightCard(point.id);
        document
          .querySelector<HTMLElement>(
            '[data-directory-card][data-studio-id="' + cssEscape(point.id) + '"]',
          )
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      });

      markerById.set(point.id, marker);
    }

    function addCluster(
      L: any,
      group: StudioMapPoint[],
      label: string,
      subtitle: string,
      color: string,
      className: string,
    ) {
      const center = averageCenter(group);
      const marker = L.marker([center.lat, center.lng], {
        icon: L.divIcon({
          className: "studio-map-marker-wrap",
          html:
            '<div class="creative-map-cluster ' +
            className +
            '" style="--cluster-color:' + color + '">' +
            '<strong>' + group.length + "</strong>" +
            (subtitle ? '<span>' + escapeHtml(subtitle) + "</span>" : "") +
            (label ? '<small>' + escapeHtml(label) + "</small>" : "") +
            "</div>",
          iconSize: className.includes("world") ? [92, 78] : [84, 66],
          iconAnchor: [className.includes("world") ? 46 : 42, className.includes("world") ? 39 : 33],
        }),
      }).addTo(markerLayer);

      marker.on("click", () => {
        const bounds = L.latLngBounds(group.map((p) => [p.lat, p.lng]));
        readyForAreaSearch = false;
        map.fitBounds(bounds, { padding: [70, 70], maxZoom: 14 });
        window.setTimeout(() => {
          readyForAreaSearch = true;
        }, 420);
      });
    }

    function renderMarkers(L: any) {
      if (!map || !markerLayer) return;
      markerLayer.clearLayers();
      markerById.clear();

      const zoom = map.getZoom();

      if (points.length === 1 || zoom >= 13) {
        points.forEach((point) => addPointMarker(L, point));
        return;
      }

      if (zoom < 6) {
        const groups = new Map<string, StudioMapPoint[]>();
        points.forEach((point) => {
          const code = point.countryCode?.trim().toUpperCase();
          const key = code || regionName(point);
          groups.set(key, [...(groups.get(key) || []), point]);
        });

        const colors = [
          "#7c3cff",
          "#12b76a",
          "#ff3b5c",
          "#f5a300",
          "#2677ff",
          "#8f3cff",
          "#00a6a6",
        ];

        [...groups.entries()].forEach(([key, group], index) => {
          const label =
            /^[A-Z]{2}$/.test(key)
              ? countryLabel(key)
              : key;
          addCluster(
            L,
            group,
            label,
            "",
            colors[index % colors.length],
            "world country",
          );
        });
        return;
      }

      if (zoom < 10) {
        const groups = new Map<string, StudioMapPoint[]>();
        points.forEach((point) => {
          const country = point.countryCode?.trim().toUpperCase() || "";
          const city = point.city?.trim();
          const key = city
            ? country + "::" + city
            : country || regionName(point);
          groups.set(key, [...(groups.get(key) || []), point]);
        });

        [...groups.entries()].forEach(([key, group]) => {
          if (group.length < 2) {
            addPointMarker(L, group[0]);
            return;
          }
          const cityLabel = key.includes("::")
            ? key.split("::").slice(1).join("::")
            : /^[A-Z]{2}$/.test(key)
              ? countryLabel(key)
              : key;
          addCluster(L, group, cityLabel, "", "#ff3b5c", "city");
        });
        return;
      }

      if (zoom < 13) {
        const groups = new Map<string, StudioMapPoint[]>();
        points.forEach((point) => {
          const projected = map.project([point.lat, point.lng], zoom);
          const key =
            Math.floor(projected.x / 110) +
            ":" +
            Math.floor(projected.y / 110) +
            ":" +
            String(point.categoryKey || "OTHER");
          groups.set(key, [...(groups.get(key) || []), point]);
        });

        for (const group of groups.values()) {
          if (group.length < 2) {
            addPointMarker(L, group[0]);
            continue;
          }
          const meta = metaFor(group[0]);
          addCluster(
            L,
            group,
            "",
            meta.icon + " " + (group[0].category || "Creative"),
            meta.color,
            "category",
          );
        }
        return;
      }

      points.forEach((point) => addPointMarker(L, point));
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
            if (existing.dataset.loaded === "true") {
              resolve();
              return;
            }
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
          script.onload = () => {
            script.dataset.loaded = "true";
            resolve();
          };
          script.onerror = () => reject(new Error("Map library failed"));
          document.body.appendChild(script);
        });
      }

      if (cancelled || !ref.current || !window.L) return;
      const L = window.L;

      map = L.map(ref.current, {
        scrollWheelZoom: fullScreen,
        attributionControl: true,
        zoomControl: true,
        worldCopyJump: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        className: "studio-map-base-tiles",
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);

      markerLayer = L.layerGroup().addTo(map);
      const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));

      if (points.length === 1) {
        map.setView([points[0].lat, points[0].lng], 14);
      } else {
        const latSpan = bounds.getNorth() - bounds.getSouth();
        const lngSpan = bounds.getEast() - bounds.getWest();
        if (latSpan > 65 || lngSpan > 120) {
          map.setView([22, 8], 2);
        } else if (latSpan > 12 || lngSpan > 18) {
          map.fitBounds(bounds.pad(0.05), { padding: [30, 30], maxZoom: 6 });
        } else {
          map.fitBounds(bounds.pad(0.06), { padding: [30, 30], maxZoom: 12 });
        }
      }

      renderMarkers(L);

      window.setTimeout(() => {
        map.invalidateSize();
        readyForAreaSearch = true;
      }, 180);

      const captureBounds = () => {
        if (!searchArea || !readyForAreaSearch) return;
        const next = map.getBounds();
        setAreaBounds({
          north: next.getNorth(),
          south: next.getSouth(),
          east: next.getEast(),
          west: next.getWest(),
        });
      };

      map.on("dragend", captureBounds);
      map.on("zoomend", () => {
        renderMarkers(L);
        captureBounds();
      });

      const focusListener = (event: Event) => {
        const custom = event as CustomEvent<{ studioId?: string }>;
        const id = custom.detail?.studioId;
        if (!id) return;
        const point = points.find((item) => item.id === id);
        if (!point) return;
        highlightCard(id);
        readyForAreaSearch = false;
        map.setView([point.lat, point.lng], Math.max(map.getZoom(), 14), {
          animate: true,
        });
        window.setTimeout(() => {
          renderMarkers(L);
          markerById.get(id)?.openPopup();
          readyForAreaSearch = true;
        }, 350);
      };

      window.addEventListener("36:focus-studio", focusListener);
      return () => window.removeEventListener("36:focus-studio", focusListener);
    };

    let detach: (() => void) | undefined;
    load().then((cleanup) => {
      detach = cleanup;
    }).catch(() => undefined);

    return () => {
      cancelled = true;
      detach?.();
      if (map) map.remove();
    };
  }, [points, searchArea, fullScreen]);

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
    router.push(pathname + "?" + params.toString());
    setAreaBounds(null);
  }

  if (!points.length) return null;

  return (
    <div
      id="directory-map"
      className={fullScreen ? "fixed inset-0 z-[5000] bg-white" : "creative-map-shell"}
    >
      <div
        ref={ref}
        className={fullScreen ? "h-screen w-full" : "creative-map-canvas"}
        aria-label="Creative spaces map"
      />

      {searchArea && areaBounds && (
        <button
          type="button"
          onClick={applyAreaSearch}
          className="creative-map-search-area"
        >
          ⌕ Search this area
        </button>
      )}

      <div className="creative-map-top-actions">
        {navigationPoint && googleMapsUrl && wazeUrl && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setDirectionsOpen((value) => !value)}
              className="creative-map-action"
            >
              Directions
            </button>
            {directionsOpen && (
              <div className="creative-map-directions">
                <a href={googleMapsUrl} target="_blank" rel="noreferrer">
                  Google Maps <span>↗</span>
                </a>
                <a href={wazeUrl} target="_blank" rel="noreferrer">
                  Waze <span>↗</span>
                </a>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setFullScreen((value) => !value)}
          className="creative-map-action dark"
        >
          {fullScreen ? "Close map ×" : "Full map"}
        </button>
      </div>
    </div>
  );
}
