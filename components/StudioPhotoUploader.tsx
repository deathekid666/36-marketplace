"use client";

import { upload } from "@vercel/blob/client";
import { useMemo, useRef, useState } from "react";

const MAX_PHOTOS = 6;
const MAX_BYTES = 12 * 1024 * 1024;
const ACCEPTED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

type UploadState = {
  fileName: string;
  percentage: number;
};

export function StudioPhotoUploader({
  claimId,
  initialUrls,
}: {
  claimId: string;
  initialUrls: string[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const initialSet = useMemo(() => new Set(initialUrls), [initialUrls]);
  const [urls, setUrls] = useState(initialUrls.slice(0, MAX_PHOTOS));
  const [uploading, setUploading] = useState<UploadState | null>(null);
  const [error, setError] = useState("");

  async function chooseFiles(files: FileList | null) {
    if (!files?.length) return;
    setError("");

    const selected = Array.from(files);
    if (urls.length + selected.length > MAX_PHOTOS) {
      setError("A studio profile can have up to 6 photos.");
      return;
    }

    for (const file of selected) {
      if (!ACCEPTED.has(file.type)) {
        setError("Use JPG, PNG, WebP or AVIF images only.");
        break;
      }
      if (file.size > MAX_BYTES) {
        setError(file.name + " is larger than 12 MB.");
        break;
      }

      try {
        const safeName = file.name
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 120) || "studio-photo";

        const pathname =
          "studio-photos/" +
          claimId +
          "/" +
          crypto.randomUUID() +
          "-" +
          safeName;

        setUploading({ fileName: file.name, percentage: 0 });

        const blob = await upload(pathname, file, {
          access: "public",
          handleUploadUrl: "/api/studio-photos/upload",
          clientPayload: JSON.stringify({ claimId }),
          multipart: true,
          onUploadProgress(progress) {
            setUploading({
              fileName: file.name,
              percentage: Math.round(progress.percentage),
            });
          },
        });

        setUrls((current) => [...current, blob.url].slice(0, MAX_PHOTOS));
      } catch (uploadError) {
        const message =
          uploadError instanceof Error ? uploadError.message : "Upload failed";

        setError(
          /blob|token|storage|credential|oidc|unauthorized|forbidden/i.test(message)
            ? "Photo storage is not connected to this Vercel project yet. Connect a public Vercel Blob store, then retry."
            : "Could not upload " + file.name + ". " + message,
        );
        break;
      } finally {
        setUploading(null);
      }
    }

    if (inputRef.current) inputRef.current.value = "";
  }

  function move(index: number, direction: -1 | 1) {
    setUrls((current) => {
      const target = index + direction;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function remove(index: number) {
    const url = urls[index];
    setUrls((current) => current.filter((_, itemIndex) => itemIndex !== index));

    if (!initialSet.has(url)) {
      fetch("/api/studio-photos/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimId, url }),
      }).catch(() => undefined);
    }
  }

  return (
    <div className="sm:col-span-2">
      <input type="hidden" name="photoUrls" value={urls.join("\n")} />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <span className="label">Studio photos</span>
          <p className="text-xs leading-5 text-zinc-600">
            Upload up to 6 JPG, PNG, WebP or AVIF images. Maximum 12 MB each.
            Drag-free ordering keeps the controls usable on mobile.
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={Boolean(uploading) || urls.length >= MAX_PHOTOS}
          className="button-dark disabled:cursor-not-allowed disabled:opacity-40"
        >
          + Upload photos
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        multiple
        className="hidden"
        onChange={(event) => void chooseFiles(event.target.files)}
      />

      {uploading && (
        <div className="mt-4 rounded-xl border border-sky-900/40 bg-sky-950/10 p-4">
          <div className="flex items-center justify-between gap-3 text-xs">
            <b className="truncate text-sky-300">{uploading.fileName}</b>
            <span className="font-black text-zinc-400">
              {uploading.percentage}%
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-900">
            <div
              className="h-full rounded-full bg-sky-300 transition-all"
              style={{ width: uploading.percentage + "%" }}
            />
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/10 p-4 text-xs leading-5 text-red-300">
          {error}
        </div>
      )}

      {urls.length > 0 ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {urls.map((url, index) => (
            <article
              key={url}
              className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950"
            >
              <div className="relative aspect-[4/3] bg-zinc-900">
                <img
                  src={url}
                  alt={"Studio photo " + (index + 1)}
                  className="h-full w-full object-cover"
                  referrerPolicy="no-referrer"
                />
                {index === 0 && (
                  <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-sky-300 backdrop-blur">
                    Cover
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 p-3">
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={() => move(index, -1)}
                    disabled={index === 0}
                    className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-400 disabled:opacity-25"
                    aria-label="Move photo earlier"
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    onClick={() => move(index, 1)}
                    disabled={index === urls.length - 1}
                    className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-400 disabled:opacity-25"
                    aria-label="Move photo later"
                  >
                    →
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void remove(index)}
                  className="text-[10px] font-black uppercase tracking-[0.08em] text-red-400 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="mt-4 flex min-h-36 w-full flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 bg-black/20 px-6 text-center hover:border-sky-900"
        >
          <b className="text-sm text-zinc-300">Add studio photos</b>
          <span className="mt-1 text-xs text-zinc-600">
            Select images from your phone or computer.
          </span>
        </button>
      )}

      <p className="mt-3 text-[10px] leading-5 text-zinc-700">
        {urls.length}/{MAX_PHOTOS} photos · first photo is the directory cover.
        New uploads are stored directly in Vercel Blob and become public only
        after you save this verified-owner profile.
      </p>
    </div>
  );
}
