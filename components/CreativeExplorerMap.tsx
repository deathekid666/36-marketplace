"use client";

import * as maplibregl from "maplibre-gl";

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

const CATEGORY_META: Record<string, { icon: string; color: string }> = {
  RECORDING: { icon: "●", color: "#ff385c" },
  PODCAST: { icon: "◉", color: "#7c3cff" },
  PHOTO: { icon: "▣", color: "#2677ff" },
  VIDEO: { icon: "▶", color: "#ff8a00" },
  REHEARSAL: { icon: "♪", color: "#12b76a" },
  DJ: { icon: "⌁", color: "#222222" },
  PRODUCTION: { icon: "◆", color: "#222222" },
  IMAGE_LAB: { icon: "△", color: "#f5a300" },
  POST_PRODUCTION: { icon: "△", color: "#f5a300" },
  VOICE_OVER: { icon: "▮", color: "#1888ff" },
  LIVE_STREAMING: { icon: "◍", color: "#00a6a6" },
  OTHER: { icon: "•", color: "#717171" },
};

const MAP_STYLE = {
  version: 8 as const,
  sources: {
    cartoLight: {
      type: "raster" as const,
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}@2x.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    {
      id: "carto-light",
      type: "raster" as const,
      source: "cartoLight",
      minzoom: 0,
      maxzoom: 20,
    },
  ],
};

function categoryMeta(key: string | null | undefined) {
  return CATEGORY_META[String(key || "OTHER")] || CATEGORY_META.OTHER;
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
  return cleaned.length > 26 ? cleaned.slice(0, 24) + "…" : cleaned;
}

function cssEscape(value: string) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
}

export function CreativeExplorerMap({
  filters,
}: {
  filters: ExplorerFilters;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const fetchAbortRef = useRef<AbortController | null>(null);
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFocusRef = useRef<string | null>(null);
  const didAutoFitRef = useRef(false);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [fullScreen, setFullScreen] = useState(false);
  const [areaDirty, setAreaDirty] = useState(false);
  const [meta, setMeta] = useState<MapMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [mapError, setMapError] = useState("");

  const filterKey = JSON.stringify(filters);
  const debug = searchParams.get("mapdebug") === "1";

  useEffect(() => {
    if (!fullScreen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [fullScreen]);

  useEffect(() => {
    mapRef.current?.resize?.();
  }, [fullScreen]);

  useEffect(() => {
    if (!ref.current) return;

    let disposed = false;

    function clearMarkers() {
      for (const marker of markersRef.current) {
        marker.remove?.();
      }
      markersRef.current = [];
    }

    function highlightCard(id: string) {
      document.querySelectorAll<HTMLElement>("[data-directory-card]").forEach(
        (card) => {
          card.dataset.mapActive =
            card.dataset.studioId === id ? "true" : "false";
        },
      );
    }

    function countryElement(node: ClusterNode) {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "air-map-country-pin";
      element.innerHTML =
        "<b>" +
        node.count.toLocaleString("en") +
        "</b><span>" +
        escapeHtml(node.label) +
        "</span>";
      return element;
    }

    function cityElement(node: ClusterNode) {
      const element = document.createElement("button");
      element.type = "button";
      element.className = "air-map-city-pin";
      element.innerHTML =
        "<b>" +
        escapeHtml(node.label) +
        "</b><span>" +
        node.count.toLocaleString("en") +
        "</span>";
      return element;
    }

    function categoryElement(node: ClusterNode) {
      const category = categoryMeta(node.categoryKey);
      const element = document.createElement("button");
      element.type = "button";
      element.className = "air-map-category-pin";
      element.innerHTML =
        '<i style="--pin-color:' +
        category.color +
        '">' +
        escapeHtml(category.icon) +
        "</i><b>" +
        escapeHtml(node.label) +
        "</b><span>" +
        node.count.toLocaleString("en") +
        "</span>";
      return element;
    }

    function placeElement(node: PlaceNode) {
      const category = categoryMeta(node.categoryKey);
      const element = document.createElement("button");
      element.type = "button";

      if (node.kind === "BOOKABLE" && node.price) {
        element.className = "air-map-price-pin";
        element.innerHTML =
          "<b>" + node.price.toLocaleString("en") + " MAD</b>";
        return element;
      }

      element.className = "air-map-mini-pin";
      element.title = node.name;
      element.innerHTML =
        '<span style="--pin-color:' +
        category.color +
        '"></span>';
      return element;
    }

    function popupHtml(node: PlaceNode) {
      const photo = node.photoUrl
        ? '<img class="air-map-popup-photo" src="' +
          escapeHtml(node.photoUrl) +
          '" alt="" referrerpolicy="no-referrer" />'
        : '<div class="air-map-popup-photo fallback">36</div>';

      return (
        '<div class="air-map-popup-card">' +
        photo +
        '<div class="air-map-popup-copy">' +
        '<div class="air-map-popup-title">' +
        "<strong>" +
        escapeHtml(node.name) +
        "</strong>" +
        (node.rating
          ? "<span>★ " + node.rating.toFixed(1) + "</span>"
          : "") +
        "</div>" +
        "<p>" +
        escapeHtml(
          [node.category, node.city].filter(Boolean).join(" · "),
        ) +
        "</p>" +
        (node.kind === "BOOKABLE" && node.price
          ? "<b>" +
            node.price.toLocaleString("en") +
            " MAD <small>/ hour</small></b>"
          : "<em>Contact only</em>") +
        '<div class="air-map-popup-actions">' +
        '<a href="' +
        escapeHtml(node.href) +
        '">View details</a>' +
        '<a href="https://www.google.com/maps/dir/?api=1&destination=' +
        encodeURIComponent(node.lat + "," + node.lng) +
        '" target="_blank" rel="noreferrer">Directions ↗</a>' +
        "</div></div></div>"
      );
    }

    function fitNodes(nodes: MapNode[]) {
      const map = mapRef.current;
      if (!map || !nodes.length) return;

      const lngs = nodes.map((node) => node.lng);
      const lats = nodes.map((node) => node.lat);
      const west = Math.min(...lngs);
      const east = Math.max(...lngs);
      const south = Math.min(...lats);
      const north = Math.max(...lats);

      if (nodes.length === 1) {
        map.easeTo({
          center: [nodes[0].lng, nodes[0].lat],
          zoom: filters.city ? 10 : 5.5,
          duration: 0,
        });
        return;
      }

      map.fitBounds(
        [
          [west, south],
          [east, north],
        ],
        {
          padding: 70,
          maxZoom: filters.city ? 10 : 5.5,
          duration: 0,
        },
      );
    }

    function renderNodes(maplibre: any, nodes: MapNode[]) {
      const map = mapRef.current;
      if (!map) return;

      clearMarkers();

      for (const node of nodes) {
        const element =
          node.type === "country"
            ? countryElement(node)
            : node.type === "city"
              ? cityElement(node)
              : node.type === "category"
                ? categoryElement(node)
                : placeElement(node as PlaceNode);

        const marker = new maplibre.Marker({
          element,
          anchor: "center",
        })
          .setLngLat([node.lng, node.lat])
          .addTo(map);

        if (node.type === "place") {
          const popup = new maplibre.Popup({
            offset: 18,
            closeButton: true,
            maxWidth: "310px",
            className: "air-map-popup",
          }).setHTML(popupHtml(node));

          marker.setPopup(popup);

          element.addEventListener("click", () => {
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

          if (pendingFocusRef.current === node.id) {
            map.easeTo({
              center: [node.lng, node.lat],
              zoom: 14,
              duration: 350,
            });
            marker.togglePopup();
            pendingFocusRef.current = null;
          }
        } else {
          element.addEventListener("click", () => {
            const targetZoom =
              node.type === "country"
                ? 5.5
                : node.type === "city"
                  ? 8.5
                  : 12;
            map.easeTo({
              center: [node.lng, node.lat],
              zoom: Math.max(map.getZoom() + 1.5, targetZoom),
              duration: 500,
            });
          });
        }

        markersRef.current.push(marker);
      }
    }

    async function refreshNodes(maplibre: any) {
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
        renderNodes(maplibre, payload.nodes);

        if (
          !didAutoFitRef.current &&
          (filters.city ||
            filters.country ||
            filters.lat != null ||
            filters.north != null) &&
          payload.nodes.length > 0
        ) {
          didAutoFitRef.current = true;
          fitNodes(payload.nodes);
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

    function scheduleRefresh(maplibre: any, delay = 160) {
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current);
      }
      fetchTimerRef.current = setTimeout(() => {
        refreshNodes(maplibre);
      }, delay);
    }

    async function initialize() {
      const maplibre = maplibregl;
      if (disposed || !ref.current) return;

      const map = new maplibre.Map({
        container: ref.current,
        style: MAP_STYLE,
        center: [0, 20],
        zoom: 1.6,
        minZoom: 1.35,
        maxZoom: 18,
        renderWorldCopies: false,
        maxBounds: [
          [-180, -75],
          [180, 84],
        ],
        attributionControl: true,
        dragRotate: false,
        pitchWithRotate: false,
      });

      mapRef.current = map;
      map.touchZoomRotate.disableRotation();

      map.addControl(
        new maplibre.NavigationControl({
          showCompass: false,
          visualizePitch: false,
        }),
        "bottom-right",
      );

      map.on("load", async () => {
        if (disposed) return;
        await refreshNodes(maplibre);
      });

      map.on("zoomend", () => scheduleRefresh(maplibre, 120));
      map.on("moveend", () => scheduleRefresh(maplibre, 180));
      map.on("dragend", () => setAreaDirty(true));
      map.on("error", (event: any) => {
        const message = String(event?.error?.message || "");
        if (/webgl|context/i.test(message) && !disposed) {
          setMapError("This browser could not start the interactive map.");
        }
      });

      const focusListener = (event: Event) => {
        const custom = event as CustomEvent<{
          studioId?: string;
          lat?: number | null;
          lng?: number | null;
        }>;
        const id = custom.detail?.studioId;
        const lat = Number(custom.detail?.lat);
        const lng = Number(custom.detail?.lng);

        if (!id || !Number.isFinite(lat) || !Number.isFinite(lng)) return;

        pendingFocusRef.current = id;
        highlightCard(id);
        map.easeTo({
          center: [lng, lat],
          zoom: 14,
          duration: 450,
        });
      };

      window.addEventListener("36:focus-studio", focusListener);

      return () => {
        window.removeEventListener("36:focus-studio", focusListener);
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
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
      clearMarkers();
      mapRef.current?.remove?.();
      mapRef.current = null;
    };
  }, [filterKey]);

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
          : "air-map-shell"
      }
    >
      <div
        ref={ref}
        className={
          fullScreen
            ? "h-screen w-full"
            : "air-map-canvas"
        }
        aria-label="Creative spaces map"
      />

      {areaDirty && (
        <button
          type="button"
          onClick={searchThisArea}
          className="air-map-search-area"
        >
          Search this area
        </button>
      )}

      <button
        type="button"
        onClick={() => setFullScreen((value) => !value)}
        className="air-map-fullscreen"
      >
        {fullScreen ? "Close ×" : "Full map"}
      </button>

      {loading && (
        <div className="air-map-loading">
          <span />
          Loading spaces
        </div>
      )}

      {mapError && (
        <div className="air-map-error">
          {mapError}
        </div>
      )}

      {debug && meta && !loading && !mapError && (
        <div className="air-map-debug">
          {meta.matchedMapped.toLocaleString("en")} mapped · {meta.level} ·{" "}
          {meta.renderedNodes} markers
        </div>
      )}
    </div>
  );
}
