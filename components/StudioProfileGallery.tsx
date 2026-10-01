"use client";

import { useEffect, useState } from "react";

type Photo = {
  id: string;
  url: string;
  alt: string;
};

export function StudioProfileGallery({
  studioName,
  photos,
}: {
  studioName: string;
  photos: Photo[];
}) {
  const [open, setOpen] = useState(false);
  const visible = photos.slice(0, 5);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (photos.length === 0) {
    return (
      <div className="mt-6 grid h-[420px] place-items-center overflow-hidden rounded-[1.75rem] bg-[#f3f3f3]">
        <div className="text-center">
          <div className="text-7xl font-black text-acid">36</div>
          <p className="mt-3 text-sm text-[#8a8a8a]">
            Studio photos coming soon
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative mt-6 grid h-[360px] gap-2 overflow-hidden rounded-[1.75rem] sm:h-[460px] md:grid-cols-4 md:grid-rows-2">
        {visible.map((photo, index) => (
          <button
            type="button"
            key={photo.id}
            onClick={() => setOpen(true)}
            className={
              "group relative overflow-hidden bg-[#f3f3f3] " +
              (index === 0
                ? "md:col-span-2 md:row-span-2"
                : "")
            }
          >
            <img
              src={photo.url}
              alt={photo.alt || studioName}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.025]"
            />
            <span className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10" />
          </button>
        ))}

        {visible.length < 5 &&
          Array.from({ length: 5 - visible.length }, (_, index) => (
            <div
              key={"placeholder-" + index}
              className="hidden bg-[#f3f3f3] md:block"
            />
          ))}

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="absolute bottom-4 right-4 rounded-xl border border-black/20 bg-white px-4 py-2.5 text-xs font-black text-black shadow-xl"
        >
          ▦ Show all photos · {photos.length}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[6000] overflow-y-auto bg-black text-white">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#ebebeb] bg-black/90 px-5 py-4 backdrop-blur">
            <div>
              <b className="text-sm">{studioName}</b>
              <span className="ml-2 text-xs text-[#8a8a8a]">
                {photos.length} photo{photos.length === 1 ? "" : "s"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="grid h-10 w-10 place-items-center rounded-full border border-[#dddddd] text-lg text-[#333333]"
              aria-label="Close photos"
            >
              ×
            </button>
          </div>

          <div className="mx-auto grid max-w-5xl gap-4 px-4 py-6 sm:grid-cols-2 sm:px-6">
            {photos.map((photo, index) => (
              <div
                key={photo.id}
                className={
                  "overflow-hidden rounded-2xl bg-white " +
                  (index % 5 === 0 ? "sm:col-span-2" : "")
                }
              >
                <img
                  src={photo.url}
                  alt={photo.alt || studioName}
                  className="h-auto w-full object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
