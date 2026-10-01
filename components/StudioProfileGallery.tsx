"use client";

import { useEffect, useState } from "react";

type Photo = {
  id: string;
  url: string;
  alt: string;
};

function GalleryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

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
      <div className="studio-detail-gallery-empty">
        <div>
          <span>36</span>
          <b>Photos coming soon</b>
          <p>This verified studio has not uploaded a gallery yet.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={"studio-detail-gallery studio-detail-gallery-count-" + Math.min(visible.length, 5)}>
        {visible.map((photo, index) => (
          <button
            type="button"
            key={photo.id}
            onClick={() => setOpen(true)}
            className={"studio-detail-gallery-item studio-detail-gallery-item-" + index}
            aria-label={"Open " + studioName + " photos"}
          >
            <img src={photo.url} alt={photo.alt || studioName} />
            <span className="studio-detail-gallery-hover" />
          </button>
        ))}

        <button
          type="button"
          onClick={() => setOpen(true)}
          className="studio-detail-show-photos"
        >
          <GalleryIcon />
          <span>Show all photos</span>
          <b>{photos.length}</b>
        </button>
      </div>

      {open && (
        <div className="studio-detail-lightbox">
          <div className="studio-detail-lightbox-bar">
            <div>
              <b>{studioName}</b>
              <span>{photos.length} photo{photos.length === 1 ? "" : "s"}</span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close photos"
            >
              ×
            </button>
          </div>

          <div className="studio-detail-lightbox-grid">
            {photos.map((photo, index) => (
              <figure
                key={photo.id}
                className={index % 5 === 0 ? "wide" : ""}
              >
                <img
                  src={photo.url}
                  alt={photo.alt || studioName}
                />
              </figure>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
