"use client";

import { useEffect, useRef, useState } from "react";

type Result = {
  label: string;
  latitude: number;
  longitude: number;
  city?: string;
  neighborhood?: string;
  country?: string;
  countryCode?: string;
};

const WORLD_CENTER = { lat: 20, lng: 0 };

function validCoordinate(value: string, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max;
}

export function StudioLocationFields(props: {
  city: string;
  neighborhood: string;
  address: string;
  latitude: string;
  longitude: string;
  required?: boolean;
}) {
  const [city, setCity] = useState(props.city);
  const [neighborhood, setNeighborhood] = useState(props.neighborhood);
  const [address, setAddress] = useState(props.address);
  const [lat, setLat] = useState(props.latitude);
  const [lng, setLng] = useState(props.longitude);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);

  useEffect(() => {
    if (address.trim().length < 4) {
      setResults([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const response = await fetch(
          "/api/geocode?q=" +
            encodeURIComponent(
              city.trim() && !address.toLowerCase().includes(city.trim().toLowerCase())
                ? address + ", " + city
                : address,
            ),
          { signal: controller.signal },
        );
        const data = await response.json().catch(() => ({ results: [] }));
        setResults(response.ok ? data.results || [] : []);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResults([]);
        }
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [address, city]);

  useEffect(() => {
    let disposed = false;

    async function initializeMap() {
      if (!mapElementRef.current || mapRef.current) return;

      const imported = await import("leaflet");
      const L = imported.default || imported;
      if (disposed || !mapElementRef.current) return;

      leafletRef.current = L;

      const hasSaved =
        validCoordinate(lat, -90, 90) &&
        validCoordinate(lng, -180, 180);
      const center: [number, number] = hasSaved
        ? [Number(lat), Number(lng)]
        : [WORLD_CENTER.lat, WORLD_CENTER.lng];

      const map = L.map(mapElementRef.current, {
        center,
        zoom: hasSaved ? 16 : 2,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
        {
          subdomains: "abcd",
          maxZoom: 20,
          attribution: "© OpenStreetMap contributors © CARTO",
        },
      ).addTo(map);

      const pinIcon = L.divIcon({
        className: "studio-location-pin-shell",
        html: '<div class="studio-location-pin"><span>36</span></div>',
        iconSize: [38, 46],
        iconAnchor: [19, 43],
      });

      const marker = L.marker(center, {
        draggable: true,
        icon: pinIcon,
        opacity: hasSaved ? 1 : 0.72,
      }).addTo(map);

      function applyPosition(nextLat: number, nextLng: number) {
        setLat(nextLat.toFixed(6));
        setLng(nextLng.toFixed(6));
        marker.setLatLng([nextLat, nextLng]);
        marker.setOpacity(1);
      }

      marker.on("dragend", () => {
        const position = marker.getLatLng();
        applyPosition(position.lat, position.lng);
      });

      map.on("click", (event: any) => {
        applyPosition(event.latlng.lat, event.latlng.lng);
      });

      mapRef.current = map;
      markerRef.current = marker;
      setMapReady(true);

      window.setTimeout(() => map.invalidateSize(), 100);
    }

    void initializeMap();

    return () => {
      disposed = true;
      mapRef.current?.remove?.();
      mapRef.current = null;
      markerRef.current = null;
      leafletRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const marker = markerRef.current;
    if (!map || !marker) return;
    if (
      !validCoordinate(lat, -90, 90) ||
      !validCoordinate(lng, -180, 180)
    ) {
      return;
    }

    const nextLat = Number(lat);
    const nextLng = Number(lng);
    const current = marker.getLatLng();
    if (
      Math.abs(current.lat - nextLat) < 0.000001 &&
      Math.abs(current.lng - nextLng) < 0.000001
    ) {
      return;
    }

    marker.setLatLng([nextLat, nextLng]);
    marker.setOpacity(1);
  }, [lat, lng]);

  function choose(result: Result) {
    setAddress(result.label);
    setLat(String(result.latitude));
    setLng(String(result.longitude));
    if (result.city) setCity(result.city);
    if (result.neighborhood) setNeighborhood(result.neighborhood);
    setResults([]);

    const map = mapRef.current;
    const marker = markerRef.current;
    if (map && marker) {
      marker.setLatLng([result.latitude, result.longitude]);
      marker.setOpacity(1);
      map.flyTo([result.latitude, result.longitude], 17, {
        animate: true,
        duration: 0.7,
      });
    }
  }

  function useCurrentPin() {
    const map = mapRef.current;
    if (!map) return;
    const center = map.getCenter();
    setLat(center.lat.toFixed(6));
    setLng(center.lng.toFixed(6));
    markerRef.current?.setLatLng(center);
    markerRef.current?.setOpacity(1);
  }

  const hasExactPin =
    validCoordinate(lat, -90, 90) &&
    validCoordinate(lng, -180, 180);

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="label">City</span>
          <input
            className="field"
            name="city"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            required={props.required}
            placeholder="City"
          />
        </label>

        <label>
          <span className="label">Neighborhood</span>
          <input
            className="field"
            name="neighborhood"
            value={neighborhood}
            onChange={(event) => setNeighborhood(event.target.value)}
            placeholder="Maarif, Gauthier…"
          />
        </label>
      </div>

      <label className="relative block">
        <span className="label">Address</span>
        <input
          className="field"
          name="address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="Start typing the studio address…"
          autoComplete="off"
          required={props.required}
        />

        {loading && (
          <span className="mt-1 block text-[10px] text-[#8a8a8a]">
            Searching worldwide…
          </span>
        )}

        {results.length > 0 && (
          <div className="absolute z-[800] mt-1 w-full overflow-hidden rounded-xl border border-[#dddddd] bg-white shadow-2xl">
            {results.map((result, index) => (
              <button
                type="button"
                key={result.label + "-" + index}
                onClick={() => choose(result)}
                className="block w-full border-b border-[#ebebeb] px-4 py-3 text-left text-xs text-[#333333] last:border-0 hover:bg-[#f3f3f3]"
              >
                {result.label}
              </button>
            ))}
          </div>
        )}
      </label>

      <div className="overflow-hidden rounded-2xl border border-[#dddddd] bg-[#f3f3f3]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e5e5] bg-white px-4 py-3">
          <div>
            <b className="text-xs">Exact map pin</b>
            <span className="ml-2 text-[10px] text-[#8a8a8a]">
              {hasExactPin
                ? "Saved coordinates"
                : "Choose an address or place the pin"}
            </span>
          </div>

          <button
            type="button"
            onClick={useCurrentPin}
            disabled={!mapReady}
            className="rounded-full border border-[#dddddd] px-3 py-1.5 text-[10px] font-black text-[#555] disabled:opacity-40"
          >
            Use map center
          </button>
        </div>

        <div ref={mapElementRef} className="h-72 w-full sm:h-80" />

        <div className="border-t border-[#e5e5e5] bg-white px-4 py-3 text-[10px] leading-5 text-[#8a8a8a]">
          Click the map or drag the <b className="text-[#222]">36</b> pin to the studio entrance.
          The exact coordinates are used for map placement and availability discovery.
          <span className="ml-1">Location search may use OpenStreetMap data when the primary geocoder is unavailable.</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          <span className="label">Latitude</span>
          <input
            className="field"
            name="latitude"
            type="number"
            step="0.000001"
            min="-90"
            max="90"
            value={lat}
            onChange={(event) => setLat(event.target.value)}
            required={props.required}
          />
        </label>

        <label>
          <span className="label">Longitude</span>
          <input
            className="field"
            name="longitude"
            type="number"
            step="0.000001"
            min="-180"
            max="180"
            value={lng}
            onChange={(event) => setLng(event.target.value)}
            required={props.required}
          />
        </label>
      </div>
    </>
  );
}
