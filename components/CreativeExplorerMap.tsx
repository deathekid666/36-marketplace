"use client";

import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useEffect, useRef, useState } from "react";

type ExplorerFilters = {
  q?: string;
  country?: string;
  city?: string;
  category?: string;
  lat?: number | null;
  lng?: number | null;
  radius?: number | null;
  north?: number | null;
  south?: number | null;
  east?: number | null;
  west?: number | null;
};

type ClusterNode = {
  type: "country" | "city" | "category";
  id: string;
  lat: number;
  lng: number;
  count: number;
  label: string;
  categoryKey?: string | null;
};

type PlaceNode = {
  type: "place";
  id: string;
  name: string;
  lat: number;
  lng: number;
  href: string;
  kind: "BOOKABLE" | "CONTACT";
  categoryKey: string;
  category: string;
  countryCode: string | null;
  city: string | null;
  price: number | null;
  rating: number | null;
  photoUrl: string | null;
};

type MapNode = ClusterNode | PlaceNode;

type MapMeta = {
  level: "country" | "city" | "category" | "place";
  matchedMapped: number;
  renderedNodes: number;
  unknownCountryCount: number;
  contactCount: number;
  bookableCount: number;
};

declare global {
  interface Window {
    L?: any;
  }
}

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

const COUNTRY_COLORS = [
  "#7c3cff",
  "#12b76a",
  "#ff3b5c",
  "#f5a300",
  "#2677ff",
  "#00a6a6",
  "#8f3cff",
];

function categoryMeta(key: string | null | undefined) {
  return CATEGORY_META[String(key || "OTHER")] || CATEGORY_META.OTHER;
}

function hashColor(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return COUNTRY_COLORS[hash % COUNTRY_COLORS.length];
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

function compactName(value: string) {
  const cleaned = value.trim();
  return cleaned.length > 24 ? cleaned.slice(0, 22) + "…" : cleaned;
}

function cssEscape(value: string) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

async function ensureLeaflet() {
  if (!document.querySelector('link[data-leaflet="36"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.dataset.leaflet = "36";
    document.head.appendChild(link);
  }

  if (window.L) return window.L;

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

  return window.L;
}

export function CreativeExplorerMap({
  filters,
}: {
  filters: ExplorerFilters;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerLayerRef = useRef<any>(null);
  const markersByIdRef = useRef<Map<string, any>>(new Map());
  const fetchAbortRef = useRef<AbortController | null>(null);
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFocusRef = useRef<string | null>(null);
  const didAutoFocusRef = useRef(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [fullScreen, setFullScreen] = useState(false);
  const [areaDirty, setAreaDirty] = useState(false);
  const [meta, setMeta] = useState<MapMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapError, setMapError] = useState("");

  const filterKey = JSON.stringify(filters);

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
    if (!ref.current) return;

    let disposed = false;

    function highlightCard(id: string) {
      document.querySelectorAll<HTMLElement>("[data-directory-card]").forEach(
        (card) => {
          card.dataset.mapActive =
            card.dataset.studioId === id ? "true" : "false";
        },
      );
    }

    function createClusterIcon(L: any, node: ClusterNode) {
      const color =
        node.type === "category"
          ? categoryMeta(node.categoryKey).color
          : node.type === "city"
            ? "#ff3b5c"
            : hashColor(node.id);

      const className =
        "creative-map-cluster " +
        (node.type === "country"
          ? "world country"
          : node.type === "city"
            ? "city"
            : "category");

      const metaForCategory =
        node.type === "category" ? categoryMeta(node.categoryKey) : null;

      const subtitle =
        node.type === "category" && metaForCategory
          ? metaForCategory.icon + " " + node.label
          : "";

      return L.divIcon({
        className: "studio-map-marker-wrap",
        html:
          '<div class="' +
          className +
          '" style="--cluster-color:' +
          color +
          '">' +
          "<strong>" +
          node.count +
          "</strong>" +
          (subtitle
            ? "<span>" + escapeHtml(subtitle) + "</span>"
            : "") +
          '<small>' +
          escapeHtml(node.label) +
          "</small>" +
          "</div>",
        iconSize:
          node.type === "country"
            ? [78, 72]
            : node.type === "city"
              ? [76, 64]
              : [82, 64],
        iconAnchor:
          node.type === "country"
            ? [39, 36]
            : node.type === "city"
              ? [38, 32]
              : [41, 32],
      });
    }

    function createPlaceIcon(L: any, node: PlaceNode) {
      const category = categoryMeta(node.categoryKey);
      const label =
        node.kind === "BOOKABLE" && node.price
          ? node.price + " MAD"
          : category.icon + " " + compactName(node.name);
      const width = Math.max(76, Math.min(170, 34 + label.length * 6.2));

      return L.divIcon({
        className: "studio-map-marker-wrap",
        html:
          '<div class="creative-map-pin ' +
          (node.kind === "BOOKABLE" ? "is-bookable" : "is-contact") +
          '" style="--pin-color:' +
          category.color +
          '">' +
          '<span class="creative-map-pin-dot">' +
          escapeHtml(category.icon) +
          "</span>" +
          "<b>" +
          escapeHtml(label) +
          "</b>" +
          "</div>",
        iconSize: [width, 40],
        iconAnchor: [Math.round(width / 2), 20],
      });
    }

    function bindPlacePopup(marker: any, node: PlaceNode) {
      const photo = node.photoUrl
        ? '<img src="' +
          escapeHtml(node.photoUrl) +
          '" alt="" referrerpolicy="no-referrer" />'
        : "";

      marker.bindPopup(
        '<div class="creative-map-popup">' +
          photo +
          '<div class="creative-map-popup-copy">' +
          "<strong>" +
          escapeHtml(node.name) +
          "</strong>" +
          "<span>" +
          escapeHtml(
            [node.category, node.city].filter(Boolean).join(" · "),
          ) +
          "</span>" +
          (node.rating
            ? '<span class="creative-map-rating">★ ' +
              node.rating.toFixed(1) +
              "</span>"
            : "") +
          (node.kind === "BOOKABLE" && node.price
            ? "<b>" +
              node.price +
              " MAD <small>/ hour</small></b>"
            : "<em>Contact only</em>") +
          '<div class="studio-map-popup-actions">' +
          '<a href="' +
          escapeHtml(node.href) +
          '">View details</a>' +
          '<a href="https://www.google.com/maps/dir/?api=1&destination=' +
          encodeURIComponent(node.lat + "," + node.lng) +
          '" target="_blank" rel="noreferrer">Directions ↗</a>' +
          "</div></div></div>",
      );
    }

    function renderNodes(L: any, nodes: MapNode[]) {
      const map = mapRef.current;
      const layer = markerLayerRef.current;
      if (!map || !layer) return;

      layer.clearLayers();
      markersByIdRef.current.clear();

      for (const node of nodes) {
        const marker = L.marker([node.lat, node.lng], {
          icon:
            node.type === "place"
              ? createPlaceIcon(L, node)
              : createClusterIcon(L, node),
        }).addTo(layer);

        if (node.type === "place") {
          bindPlacePopup(marker, node);
          marker.on("click", () => {
            highlightCard(node.id);
            document
              .querySelector<HTMLElement>(
                '[data-directory-card][data-studio-id="' +
                  cssEscape(node.id) +
                  '"]',
              )
              ?.scrollIntoView({
                behavior: "smooth",
                block: "center",
              });
          });
          markersByIdRef.current.set(node.id, marker);
          continue;
        }

        marker.on("click", () => {
          const targetZoom =
            node.type === "country"
              ? 6
              : node.type === "city"
                ? 9
                : 12;
          map.setView(
            [node.lat, node.lng],
            Math.max(map.getZoom() + 1, targetZoom),
            { animate: true },
          );
        });
      }

      const pending = pendingFocusRef.current;
      if (pending) {
        const marker = markersByIdRef.current.get(pending);
        if (marker) {
          marker.openPopup();
          pendingFocusRef.current = null;
        }
      }
    }

    async function refreshNodes(L: any) {
      const map = mapRef.current;
      if (!map) return;

      fetchAbortRef.current?.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;

      const params = new URLSearchParams();
      params.set("zoom", String(Math.round(map.getZoom())));

      if (filters.q) params.set("q", filters.q);
      if (filters.country) params.set("country", filters.country);
      if (filters.city) params.set("city", filters.city);
      if (filters.category) params.set("category", filters.category);
      if (filters.lat != null) params.set("lat", String(filters.lat));
      if (filters.lng != null) params.set("lng", String(filters.lng));
      if (filters.radius != null) params.set("radius", String(filters.radius));
      if (filters.north != null) params.set("north", String(filters.north));
      if (filters.south != null) params.set("south", String(filters.south));
      if (filters.east != null) params.set("east", String(filters.east));
      if (filters.west != null) params.set("west", String(filters.west));

      if (map.getZoom() >= 8) {
        const bounds = map.getBounds();
        params.set("viewNorth", bounds.getNorth().toFixed(5));
        params.set("viewSouth", bounds.getSouth().toFixed(5));
        params.set("viewEast", bounds.getEast().toFixed(5));
        params.set("viewWest", bounds.getWest().toFixed(5));
      }

      setLoading(true);
      setMapError("");

      try {
        const response = await fetch(
          "/api/map/creative-spaces?" + params.toString(),
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );

        if (!response.ok) {
          throw new Error("Map data request failed.");
        }

        const payload = (await response.json()) as {
          nodes: MapNode[];
          meta: MapMeta;
        };

        if (disposed) return;

        setMeta(payload.meta);
        renderNodes(L, payload.nodes);

        if (
          !didAutoFocusRef.current &&
          !filters.lat &&
          !filters.north &&
          (filters.city || filters.country) &&
          payload.nodes.length > 0
        ) {
          didAutoFocusRef.current = true;
          const first = payload.nodes[0];
          map.setView(
            [first.lat, first.lng],
            filters.city ? 8 : 5,
            { animate: false },
          );
        }
      } catch (error) {
        if (
          error instanceof DOMException &&
          error.name === "AbortError"
        ) {
          return;
        }
        if (!disposed) {
          setMapError(
            error instanceof Error
              ? error.message
              : "Map data could not be loaded.",
          );
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    }

    function scheduleRefresh(L: any, delay = 120) {
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current);
      }
      fetchTimerRef.current = setTimeout(() => {
        refreshNodes(L);
      }, delay);
    }

    async function initialize() {
      const L = await ensureLeaflet();
      if (!L || disposed || !ref.current) return;

      const map = L.map(ref.current, {
        scrollWheelZoom: fullScreen,
        attributionControl: true,
        zoomControl: true,
        minZoom: 2,
        maxZoom: 18,
        zoomSnap: 1,
        worldCopyJump: false,
        maxBounds: [
          [-85.0511, -180],
          [85.0511, 180],
        ],
        maxBoundsViscosity: 1,
      });

      mapRef.current = map;

      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          minZoom: 2,
          maxZoom: 19,
          noWrap: true,
          bounds: [
            [-85.0511, -180],
            [85.0511, 180],
          ],
          className: "studio-map-base-tiles",
          attribution: "© OpenStreetMap contributors",
        },
      ).addTo(map);

      markerLayerRef.current = L.layerGroup().addTo(map);

      if (
        filters.north != null &&
        filters.south != null &&
        filters.east != null &&
        filters.west != null
      ) {
        map.fitBounds(
          [
            [filters.south, filters.west],
            [filters.north, filters.east],
          ],
          { padding: [30, 30], maxZoom: 11 },
        );
      } else if (filters.lat != null && filters.lng != null) {
        map.setView(
          [filters.lat, filters.lng],
          filters.radius && filters.radius <= 10 ? 12 : 10,
        );
      } else {
        map.setView([20, 0], 2);
      }

      map.on("zoomend", () => scheduleRefresh(L, 90));
      map.on("moveend", () => scheduleRefresh(L, 130));
      map.on("dragend", () => setAreaDirty(true));

      const focusListener = (
        event: Event,
      ) => {
        const custom = event as CustomEvent<{
          studioId?: string;
          lat?: number | null;
          lng?: number | null;
        }>;
        const id = custom.detail?.studioId;
        const lat = Number(custom.detail?.lat);
        const lng = Number(custom.detail?.lng);

        if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) {
          return;
        }

        pendingFocusRef.current = id;
        highlightCard(id);
        map.setView([lat, lng], 14, { animate: true });
      };

      window.addEventListener(
        "36:focus-studio",
        focusListener,
      );

      map.invalidateSize();
      await refreshNodes(L);

      return () => {
        window.removeEventListener(
          "36:focus-studio",
          focusListener,
        );
      };
    }

    let cleanup: (() => void) | undefined;

    initialize()
      .then((value) => {
        cleanup = value;
      })
      .catch((error) => {
        if (!disposed) {
          setMapError(
            error instanceof Error
              ? error.message
              : "Map could not start.",
          );
          setLoading(false);
        }
      });

    return () => {
      disposed = true;
      cleanup?.();
      fetchAbortRef.current?.abort();
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current);
      }
      mapRef.current?.remove();
      mapRef.current = null;
      markerLayerRef.current = null;
    };
  }, [filterKey, fullScreen]);

  function searchThisArea() {
    const map = mapRef.current;
    if (!map) return;

    const bounds = map.getBounds();
    const params = new URLSearchParams(searchParams.toString());

    params.set("north", bounds.getNorth().toFixed(5));
    params.set("south", bounds.getSouth().toFixed(5));
    params.set("east", bounds.getEast().toFixed(5));
    params.set("west", bounds.getWest().toFixed(5));
    params.delete("city");
    params.delete("country");
    params.delete("lat");
    params.delete("lng");
    params.delete("radius");
    params.delete("page");

    setAreaDirty(false);
    router.push(pathname + "?" + params.toString());
  }

  return (
    <div
      id="directory-map"
      className={
        fullScreen
          ? "fixed inset-0 z-[5000] bg-white"
          : "creative-map-shell"
      }
    >
      <div
        ref={ref}
        className={
          fullScreen
            ? "h-screen w-full"
            : "creative-map-canvas"
        }
        aria-label="Creative spaces map"
      />

      {areaDirty && (
        <button
          type="button"
          onClick={searchThisArea}
          className="creative-map-search-area"
        >
          ⌕ Search this area
        </button>
      )}

      <div className="creative-map-top-actions">
        <button
          type="button"
          onClick={() => setFullScreen((value) => !value)}
          className="creative-map-action dark"
        >
          {fullScreen ? "Close map ×" : "Full map"}
        </button>
      </div>

      <div className="creative-map-diagnostics" aria-live="polite">
        {loading ? (
          <span>Loading map…</span>
        ) : mapError ? (
          <span className="error">{mapError}</span>
        ) : meta ? (
          <>
            <b>{meta.matchedMapped.toLocaleString("en")} mapped</b>
            <span>
              {meta.level} view · {meta.renderedNodes} marker
              {meta.renderedNodes === 1 ? "" : "s"}
            </span>
            {meta.unknownCountryCount > 0 && (
              <span>
                {meta.unknownCountryCount} unknown-country
              </span>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
