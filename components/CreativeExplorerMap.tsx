"use client";

import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { formatMoney } from "@/lib/commerce";

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
  currency: string | null;
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

function cssEscape(value: string) {
  if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(value);
  return value.replace(/["\\]/g, "\\$&");
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
    (node.rating ? "<span>★ " + node.rating.toFixed(1) + "</span>" : "") +
    "</div>" +
    "<p>" +
    escapeHtml([node.category, node.city].filter(Boolean).join(" · ")) +
    "</p>" +
    (node.kind === "BOOKABLE" && node.price
      ? "<b>" +
        escapeHtml(formatMoney(node.price, node.currency || "USD")) +
        " <small>/ hour</small></b>"
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

function markerSpec(L: any, node: MapNode) {
  if (node.type === "country") {
    return L.divIcon({
      className: "air-map-leaflet-icon",
      html:
        '<div class="air-map-country-pin"><span>' +
        escapeHtml(node.label) +
        "</span><b>" +
        node.count.toLocaleString("en") +
        "</b></div>",
      iconSize: [118, 36],
      iconAnchor: [59, 18],
    });
  }

  if (node.type === "city") {
    return L.divIcon({
      className: "air-map-leaflet-icon",
      html:
        '<div class="air-map-city-pin"><b>' +
        escapeHtml(node.label) +
        "</b><span>" +
        node.count.toLocaleString("en") +
        "</span></div>",
      iconSize: [116, 36],
      iconAnchor: [58, 18],
    });
  }

  if (node.type === "category") {
    const category = categoryMeta(node.categoryKey);
    return L.divIcon({
      className: "air-map-leaflet-icon",
      html:
        '<div class="air-map-category-pin"><i style="--pin-color:' +
        category.color +
        '">' +
        escapeHtml(category.icon) +
        "</i><b>" +
        escapeHtml(node.label) +
        "</b><span>" +
        node.count.toLocaleString("en") +
        "</span></div>",
      iconSize: [126, 36],
      iconAnchor: [63, 18],
    });
  }

  const place = node as PlaceNode;

  if (place.kind === "BOOKABLE" && place.price) {
    return L.divIcon({
      className: "air-map-leaflet-icon",
      html:
        '<div class="air-map-price-pin"><b>' +
        escapeHtml(formatMoney(place.price, place.currency || "USD")) +
        "</b></div>",
      iconSize: [86, 34],
      iconAnchor: [43, 17],
    });
  }

  const category = categoryMeta(place.categoryKey);
  return L.divIcon({
    className: "air-map-leaflet-icon",
    html:
      '<div class="air-map-mini-pin" style="--pin-color:' +
      category.color +
      '"><span></span></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
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
  const didAutoFitRef = useRef(false);
  const pendingFocusRef = useRef<string | null>(null);
  const latestNodesRef = useRef<MapNode[]>([]);

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
    const timer = window.setTimeout(() => {
      mapRef.current?.invalidateSize?.();
    }, 60);
    return () => window.clearTimeout(timer);
  }, [fullScreen]);

  useEffect(() => {
    if (!ref.current) return;

    let disposed = false;
    let L: any;
    let markerLayer: any;
    let fallbackTilesUsed = false;

    function clearMarkers() {
      markersRef.current = [];
      markerLayer?.clearLayers?.();
    }

    function highlightCard(id: string) {
      document.querySelectorAll<HTMLElement>("[data-directory-card]").forEach(
        (card) => {
          card.dataset.mapActive =
            card.dataset.studioId === id ? "true" : "false";
        },
      );
    }

    function fitNodes(nodes: MapNode[]) {
      const map = mapRef.current;
      if (!map || !L || nodes.length === 0) return;

      if (nodes.length === 1) {
        map.setView(
          [nodes[0].lat, nodes[0].lng],
          filters.city ? 11 : 6,
          { animate: false },
        );
        return;
      }

      const bounds = L.latLngBounds(nodes.map((node) => [node.lat, node.lng]));
      map.fitBounds(bounds, {
        padding: [55, 55],
        maxZoom: filters.city ? 11 : 6,
        animate: false,
      });
    }

    function renderNodes(nodes: MapNode[]) {
      const map = mapRef.current;
      if (!map || !L || !markerLayer) return;

      clearMarkers();
      latestNodesRef.current = nodes;

      for (const node of nodes) {
        const marker = L.marker([node.lat, node.lng], {
          icon: markerSpec(L, node),
          keyboard: true,
          riseOnHover: true,
          title: node.type === "place" ? node.name : node.label,
        }).addTo(markerLayer);

        if (node.type === "place") {
          marker.bindPopup(popupHtml(node), {
            className: "air-map-leaflet-popup",
            maxWidth: 310,
            closeButton: true,
            autoPanPadding: [24, 24],
          });

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

          if (pendingFocusRef.current === node.id) {
            map.setView([node.lat, node.lng], 14, { animate: true });
            window.setTimeout(() => marker.openPopup(), 180);
            pendingFocusRef.current = null;
          }
        } else {
          marker.on("click", () => {
            const targetZoom =
              node.type === "country"
                ? 6
                : node.type === "city"
                  ? 9
                  : 12;
            map.setView(
              [node.lat, node.lng],
              Math.max(map.getZoom() + 1.5, targetZoom),
              { animate: true },
            );
          });
        }

        markersRef.current.push(marker);
      }
    }

    async function refreshNodes() {
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
        renderNodes(payload.nodes);

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

    function scheduleRefresh(delay = 180) {
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
      fetchTimerRef.current = setTimeout(() => {
        void refreshNodes();
      }, delay);
    }

    async function initialize() {
      L = (await import("leaflet")) as any;
      if (disposed || !ref.current) return;

      const map = L.map(ref.current, {
        center: [20, 0],
        zoom: 2,
        minZoom: 2,
        maxZoom: 18,
        zoomControl: false,
        attributionControl: true,
        worldCopyJump: false,
        maxBoundsViscosity: 1,
        maxBounds: [
          [-85, -180],
          [85, 180],
        ],
        preferCanvas: false,
      });

      mapRef.current = map;
      L.control.zoom({ position: "bottomright" }).addTo(map);

      const cartoTiles = L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          subdomains: "abcd",
          maxZoom: 20,
          minZoom: 2,
          noWrap: true,
          keepBuffer: 3,
          attribution: "© OpenStreetMap contributors © CARTO",
        },
      ).addTo(map);

      cartoTiles.on("tileerror", () => {
        if (fallbackTilesUsed || disposed) return;
        fallbackTilesUsed = true;
        cartoTiles.remove();
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          minZoom: 2,
          noWrap: true,
          keepBuffer: 3,
          attribution: "© OpenStreetMap contributors",
        }).addTo(map);
      });

      markerLayer = L.layerGroup().addTo(map);

      map.whenReady(() => {
        void refreshNodes();
        window.setTimeout(() => map.invalidateSize(), 80);
      });

      map.on("zoomend", () => scheduleRefresh(100));
      map.on("moveend", () => {
        if (map.getZoom() >= 8) scheduleRefresh(170);
      });
      map.on("dragend", () => setAreaDirty(true));

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
        map.setView([lat, lng], 14, { animate: true });

        const node = latestNodesRef.current.find(
          (item): item is PlaceNode =>
            item.type === "place" && item.id === id,
        );
        if (node) {
          pendingFocusRef.current = null;
          window.setTimeout(() => {
            const marker = markersRef.current.find(
              (item) =>
                Math.abs(item.getLatLng().lat - node.lat) < 0.000001 &&
                Math.abs(item.getLatLng().lng - node.lng) < 0.000001,
            );
            marker?.openPopup?.();
          }, 200);
        } else {
          scheduleRefresh(220);
        }
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
        className="air-map-canvas"
        style={
          fullScreen
            ? {
                height: "100vh",
                minHeight: 0,
                borderRadius: 0,
              }
            : undefined
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
