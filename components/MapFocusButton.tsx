"use client";

export function MapFocusButton({
  studioId,
  hasCoordinates,
  lat,
  lng,
}: {
  studioId: string;
  hasCoordinates: boolean;
  lat?: number | null;
  lng?: number | null;
}) {
  if (!hasCoordinates) return null;

  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent("36:focus-studio", {
            detail: { studioId, lat, lng },
          }),
        );
        document
          .getElementById("directory-map")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
      className="creative-card-map-link"
    >
      Show on map
    </button>
  );
}
