"use client";

import {
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
} from "react";

export type StudioMapPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  href: string;
  price?: number | null;
  kind?: "BOOKABLE" | "CONTACT";
  category?: string | null;
  rating?: number | null;
  photoUrl?: string | null;
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

type LabelMode = "price" | "name";

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
  const [areaBounds, setAreaBounds] =
    useState<Bounds | null>(null);
  const [labelMode, setLabelMode] =
    useState<LabelMode>("price");
  const labelModeRef = useRef<LabelMode>("price");
  const renderMarkersRef = useRef<(() => void) | null>(null);
  labelModeRef.current = labelMode;
  const [fullScreen, setFullScreen] =
    useState(false);
  const [directionsOpen, setDirectionsOpen] =
    useState(false);

  const navigationPoint =
    points.length === 1 ? points[0] : null;
  const hasVerifiedPrices = points.some(
    (point) => point.price != null && point.price > 0,
  );
  const googleMapsUrl = navigationPoint
    ? "https://www.google.com/maps/dir/?api=1&destination=" +
      encodeURIComponent(
        navigationPoint.lat + "," + navigationPoint.lng,
      )
    : null;
  const wazeUrl = navigationPoint
    ? "https://www.waze.com/ul?ll=" +
      encodeURIComponent(
        navigationPoint.lat + "," + navigationPoint.lng,
      ) +
      "&navigate=yes"
    : null;

  useEffect(() => {
    if (!fullScreen) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullScreen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fullScreen]);

  useEffect(() => {
    if (!ref.current || points.length === 0) return;

    let map: any;
    let cancelled = false;
    let readyForAreaSearch = false;
    const markerById = new Map<string, any>();
    let markerLayer: any;

    function highlightCard(studioId: string) {
      document
        .querySelectorAll<HTMLElement>(
          "[data-directory-card]",
        )
        .forEach((card) => {
          card.dataset.mapActive =
            card.dataset.studioId === studioId
              ? "true"
              : "false";
        });
    }

    function markerLabel(point: StudioMapPoint) {
      if (points.length === 1) {
        return compactMarkerName(point.name);
      }
      if (labelModeRef.current === "price" && point.price) {
        return point.price + " MAD";
      }
      return compactMarkerName(point.name);
    }

    function addPointMarker(
      L: any,
      point: StudioMapPoint,
    ) {
      const label = markerLabel(point);
      const markerWidth =
        labelModeRef.current === "price" && point.price
          ? 86
          : Math.max(
              92,
              Math.min(190, 30 + label.length * 7),
            );
      const kind =
        point.kind ||
        (point.price ? "BOOKABLE" : "CONTACT");
      const kindClass =
        kind === "BOOKABLE"
          ? "studio-map-marker--bookable"
          : "studio-map-marker--contact";

      const marker = L.marker(
        [point.lat, point.lng],
        {
          icon: L.divIcon({
            className: "studio-map-marker-wrap",
            html:
              '<div class="studio-map-marker ' +
              kindClass +
              '" title="' +
              escapeHtml(point.name) +
              '">' +
              escapeHtml(label) +
              "</div>",
            iconSize: [markerWidth, 38],
            iconAnchor: [
              Math.round(markerWidth / 2),
              19,
            ],
          }),
        },
      ).addTo(markerLayer);

      const popupImage = point.photoUrl
        ? '<img class="studio-map-popup-image" src="' +
          escapeHtml(point.photoUrl) +
          '" alt="" referrerpolicy="no-referrer" />'
        : "";
      const meta = [
        point.category || "",
        point.rating
          ? "★ " + point.rating.toFixed(1)
          : "",
      ]
        .filter(Boolean)
        .join(" · ");

      marker.bindPopup(
        '<div class="studio-map-popup">' +
          popupImage +
          "<strong>" +
          escapeHtml(point.name) +
          "</strong>" +
          (meta
            ? "<span>" +
              escapeHtml(meta) +
              "</span>"
            : "") +
          (point.price
            ? "<span>" +
              point.price +
              " MAD / hour</span>"
            : '<span class="studio-map-popup-contact">Contact only · not bookable</span>') +
          '<div class="studio-map-popup-actions">' +
          '<a href="' +
          escapeHtml(point.href) +
          '">View studio →</a>' +
          '<a href="' +
          escapeHtml(
            "https://www.google.com/maps/dir/?api=1&destination=" +
              encodeURIComponent(point.lat + "," + point.lng),
          ) +
          '" target="_blank" rel="noreferrer">Directions ↗</a>' +
          "</div></div>",
      );

      marker.on("click", () => {
        highlightCard(point.id);
        document
          .querySelector<HTMLElement>(
            '[data-directory-card][data-studio-id="' +
              cssEscape(point.id) +
              '"]',
          )
          ?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
      });

      markerById.set(point.id, marker);
    }

    function renderMarkers(L: any) {
      if (!map || !markerLayer) return;

      markerLayer.clearLayers();
      markerById.clear();

      const zoom = map.getZoom();
      const shouldCluster =
        points.length >= 8 && zoom < 14;

      if (!shouldCluster) {
        points.forEach((point) =>
          addPointMarker(L, point),
        );
        return;
      }

      const cellSize =
        zoom < 4 ? 58 : zoom < 7 ? 68 : zoom < 11 ? 76 : 66;
      const groups = new Map<
        string,
        StudioMapPoint[]
      >();

      for (const point of points) {
        const projected = map.project(
          [point.lat, point.lng],
          zoom,
        );
        const key =
          Math.floor(projected.x / cellSize) +
          ":" +
          Math.floor(projected.y / cellSize);
        groups.set(key, [
          ...(groups.get(key) || []),
          point,
        ]);
      }

      for (const group of groups.values()) {
        if (group.length < 3) {
          group.forEach((point) =>
            addPointMarker(L, point),
          );
          continue;
        }

        const projectedPoints = group.map((point) => ({
          point,
          projected: map.project(
            [point.lat, point.lng],
            zoom,
          ),
        }));
        const centerX =
          projectedPoints.reduce(
            (sum, item) => sum + item.projected.x,
            0,
          ) / projectedPoints.length;
        const centerY =
          projectedPoints.reduce(
            (sum, item) => sum + item.projected.y,
            0,
          ) / projectedPoints.length;
        const representative = projectedPoints.reduce(
          (best, item) => {
            const distance =
              Math.pow(item.projected.x - centerX, 2) +
              Math.pow(item.projected.y - centerY, 2);
            return distance < best.distance
              ? { point: item.point, distance }
              : best;
          },
          {
            point: projectedPoints[0].point,
            distance: Number.POSITIVE_INFINITY,
          },
        ).point;
        const lat = representative.lat;
        const lng = representative.lng;
        const bookableCount = group.filter(
          (point) =>
            (point.kind ||
              (point.price
                ? "BOOKABLE"
                : "CONTACT")) === "BOOKABLE",
        ).length;
        const contactCount =
          group.length - bookableCount;

        const cluster = L.marker([lat, lng], {
          icon: L.divIcon({
            className: "studio-map-marker-wrap",
            html:
              '<div class="studio-map-cluster">' +
              "<strong>" +
              group.length +
              "</strong>" +
              "<span>" +
              (hasVerifiedPrices &&
              labelModeRef.current === "price"
                ? (() => {
                    const prices = group
                      .map((point) => point.price)
                      .filter(
                        (value): value is number =>
                          typeof value === "number" &&
                          value > 0,
                      );
                    if (!prices.length) return "studios";
                    const min = Math.min(...prices);
                    const max = Math.max(...prices);
                    return min === max
                      ? min + " MAD"
                      : min + "–" + max + " MAD";
                  })()
                : hasVerifiedPrices &&
                    labelModeRef.current === "name"
                  ? compactMarkerName(group[0].name) +
                    (group.length > 1
                      ? " +" + (group.length - 1)
                      : "")
                  : bookableCount &&
                      contactCount
                    ? bookableCount +
                      " bookable · " +
                      contactCount +
                      " contacts"
                    : bookableCount
                      ? "studios"
                      : "studios") +
              "</span></div>",
            iconSize: [92, 52],
            iconAnchor: [46, 26],
          }),
        }).addTo(markerLayer);

        cluster.on("click", () => {
          const clusterBounds =
            L.latLngBounds(
              group.map((point) => [
                point.lat,
                point.lng,
              ]),
            );

          readyForAreaSearch = false;
          map.fitBounds(clusterBounds, {
            padding: [55, 55],
            maxZoom: 15,
          });
          window.setTimeout(() => {
            readyForAreaSearch = true;
          }, 450);
        });
      }
    }

    const load = async () => {
      if (
        !document.querySelector(
          'link[data-leaflet="36"]',
        )
      ) {
        const link =
          document.createElement("link");
        link.rel = "stylesheet";
        link.href =
          "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
        link.dataset.leaflet = "36";
        document.head.appendChild(link);
      }

      if (!window.L) {
        await new Promise<void>(
          (resolve, reject) => {
            const existing =
              document.querySelector(
                'script[data-leaflet="36"]',
              ) as HTMLScriptElement | null;

            if (existing) {
              if (
                existing.dataset.loaded === "true"
              ) {
                resolve();
                return;
              }
              existing.addEventListener(
                "load",
                () => resolve(),
                { once: true },
              );
              existing.addEventListener(
                "error",
                () =>
                  reject(
                    new Error(
                      "Map library failed",
                    ),
                  ),
                { once: true },
              );
              return;
            }

            const script =
              document.createElement("script");
            script.src =
              "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
            script.dataset.leaflet = "36";
            script.onload = () => {
              script.dataset.loaded = "true";
              resolve();
            };
            script.onerror = () =>
              reject(
                new Error("Map library failed"),
              );
            document.body.appendChild(script);
          },
        );
      }

      if (
        cancelled ||
        !ref.current ||
        !window.L
      ) {
        return;
      }

      const L = window.L;
      map = L.map(ref.current, {
        scrollWheelZoom: fullScreen,
        attributionControl: true,
        zoomControl: true,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          maxZoom: 20,
          subdomains: "abcd",
          attribution:
            "© OpenStreetMap contributors © CARTO",
        },
      ).addTo(map);

      markerLayer = L.layerGroup().addTo(map);
      const bounds = L.latLngBounds(
        points.map((point) => [
          point.lat,
          point.lng,
        ]),
      );

      if (points.length === 1) {
        map.setView(
          [points[0].lat, points[0].lng],
          14,
        );
      } else {
        const latSpan =
          bounds.getNorth() - bounds.getSouth();
        const lngSpan =
          bounds.getEast() - bounds.getWest();

        if (latSpan > 100 || lngSpan > 250) {
          map.setView([20, 5], 2);
        } else {
          map.fitBounds(bounds.pad(0.08), {
            padding: [24, 24],
            maxZoom: 12,
          });
        }
      }

      renderMarkersRef.current = () =>
        renderMarkers(L);
      renderMarkers(L);

      window.setTimeout(() => {
        map.invalidateSize();
        readyForAreaSearch = true;
      }, 180);

      const captureBounds = () => {
        if (
          !searchArea ||
          !readyForAreaSearch ||
          !map
        ) {
          return;
        }
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
        const custom =
          event as CustomEvent<{
            studioId?: string;
          }>;
        const studioId =
          custom.detail?.studioId;
        if (!studioId) return;

        const point = points.find(
          (item) => item.id === studioId,
        );
        if (!point) return;

        highlightCard(studioId);
        readyForAreaSearch = false;
        map.setView(
          [point.lat, point.lng],
          Math.max(map.getZoom(), 15),
          { animate: true },
        );

        window.setTimeout(() => {
          renderMarkers(L);
          markerById
            .get(studioId)
            ?.openPopup();
          readyForAreaSearch = true;
        }, 350);
      };

      window.addEventListener(
        "36:focus-studio",
        focusListener,
      );

      return () => {
        window.removeEventListener(
          "36:focus-studio",
          focusListener,
        );
      };
    };

    let detach:
      | (() => void)
      | undefined;

    load()
      .then((cleanup) => {
        detach = cleanup;
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
      detach?.();
      renderMarkersRef.current = null;
      if (map) map.remove();
    };
  }, [
    points,
    searchArea,
    fullScreen,
  ]);

  useEffect(() => {
    renderMarkersRef.current?.();
  }, [labelMode]);

  function applyAreaSearch() {
    if (!areaBounds) return;

    const params = new URLSearchParams(
      searchParams.toString(),
    );
    params.set(
      "north",
      areaBounds.north.toFixed(5),
    );
    params.set(
      "south",
      areaBounds.south.toFixed(5),
    );
    params.set(
      "east",
      areaBounds.east.toFixed(5),
    );
    params.set(
      "west",
      areaBounds.west.toFixed(5),
    );
    params.delete("city");
    params.delete("country");
    params.delete("lat");
    params.delete("lng");
    params.delete("radius");
    params.delete("page");

    router.push(
      pathname + "?" + params.toString(),
    );
    setAreaBounds(null);
  }

  if (!points.length) return null;

  return (
    <div
      id="directory-map"
      className={
        fullScreen
          ? "fixed inset-0 z-[5000] bg-black"
          : "relative"
      }
    >
      <div
        ref={ref}
        className={
          fullScreen
            ? "h-screen w-full bg-zinc-950"
            : "h-[500px] w-full overflow-hidden rounded-[22px] border border-[#dddddd] bg-[#f3f3f3] xl:h-[590px]"
        }
        aria-label="Studio locations map"
      />

      {points.length > 1 && hasVerifiedPrices && (
        <div className="absolute left-3 top-3 z-[1100] flex overflow-hidden rounded-full border border-zinc-700 bg-zinc-950/95 p-1 shadow-xl backdrop-blur">
          <button
            type="button"
            aria-pressed={
              labelModeRef.current === "price"
            }
            onClick={() =>
              setLabelMode("price")
            }
            className={
              "rounded-full px-3 py-2 text-[10px] font-black " +
              (labelModeRef.current === "price"
                ? "bg-white text-black"
                : "text-zinc-400")
            }
          >
            Price
          </button>
          <button
            type="button"
            aria-pressed={
              labelMode === "name"
            }
            onClick={() =>
              setLabelMode("name")
            }
            className={
              "rounded-full px-3 py-2 text-[10px] font-black " +
              (labelMode === "name"
                ? "bg-white text-black"
                : "text-zinc-400")
            }
          >
            Name
          </button>
        </div>
      )}

      <div className="absolute right-3 top-3 z-[1200] flex items-center gap-2">
        {navigationPoint && googleMapsUrl && wazeUrl && (
          <div className="relative">
            <button
              type="button"
              aria-expanded={directionsOpen}
              onClick={() =>
                setDirectionsOpen((value) => !value)
              }
              className="rounded-full border border-zinc-700 bg-zinc-950/95 px-4 py-2.5 text-[10px] font-black text-white shadow-xl backdrop-blur"
            >
              Directions
            </button>

            {directionsOpen && (
              <div className="absolute right-0 top-[calc(100%+8px)] min-w-[180px] overflow-hidden rounded-2xl border border-[#dddddd] bg-white p-1.5 text-[#222] shadow-2xl">
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setDirectionsOpen(false)}
                  className="flex items-center justify-between rounded-xl px-3 py-3 text-[10px] font-black transition hover:bg-[#f7f7f7]"
                >
                  <span>Google Maps</span>
                  <span aria-hidden="true">↗</span>
                </a>
                <a
                  href={wazeUrl}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setDirectionsOpen(false)}
                  className="flex items-center justify-between rounded-xl px-3 py-3 text-[10px] font-black transition hover:bg-[#f7f7f7]"
                >
                  <span>Waze</span>
                  <span aria-hidden="true">↗</span>
                </a>
              </div>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() =>
            setFullScreen((value) => !value)
          }
          className="rounded-full border border-zinc-700 bg-zinc-950/95 px-4 py-2.5 text-[10px] font-black text-white shadow-xl backdrop-blur"
        >
          {fullScreen
            ? "Close map ×"
            : "Full map"}
        </button>
      </div>

      {hasVerifiedPrices && (
        <div className="absolute bottom-3 left-3 z-[1100] flex flex-wrap gap-2">
          <span className="rounded-full border border-[#dddddd] bg-white/95 px-3 py-1.5 text-[9px] font-black text-[#222] shadow-sm">
            ● Bookable
          </span>
          {points.some((point) => point.kind === "CONTACT") && (
            <span className="rounded-full border border-[#dddddd] bg-white/95 px-3 py-1.5 text-[9px] font-black text-[#717171] shadow-sm">
              ● Contact only
            </span>
          )}
        </div>
      )}

      {searchArea && areaBounds && (
        <button
          type="button"
          onClick={applyAreaSearch}
          className="absolute left-1/2 top-4 z-[1200] -translate-x-1/2 rounded-full border border-zinc-700 bg-zinc-950/95 px-5 py-2.5 text-xs font-black text-white shadow-2xl backdrop-blur hover:border-sky-500 hover:text-sky-300"
        >
          Search this area
        </button>
      )}
    </div>
  );
}

function cssEscape(value: string) {
  if (
    typeof CSS !== "undefined" &&
    CSS.escape
  ) {
    return CSS.escape(value);
  }
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

function compactMarkerName(value: string) {
  const clean = value
    .trim()
    .replace(/\s+/g, " ");
  if (clean.length <= 22) return clean;
  return (
    clean.slice(0, 20).trimEnd() + "…"
  );
}
