"use client";

export function MapFocusButton({
  studioId,
  hasCoordinates,
}: {
  studioId: string;
  hasCoordinates: boolean;
}) {
  if (!hasCoordinates) return null;

  return (
    <button
      type="button"
      onClick={() => {
        window.dispatchEvent(
          new CustomEvent("36:focus-studio", { detail: { studioId } }),
        );
        document
          .getElementById("directory-map")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }}
      className="text-[11px] font-black text-zinc-500 transition hover:text-sky-300"
    >
      Show on map
    </button>
  );
}
