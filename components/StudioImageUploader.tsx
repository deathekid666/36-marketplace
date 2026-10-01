"use client";

import { upload } from "@vercel/blob/client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_BATCH = 10;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

function safeFileName(name: string) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "studio-photo"
  );
}

export function StudioImageUploader({ studioId }: { studioId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [fileIndex, setFileIndex] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [complete, setComplete] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setComplete("");

    const form = event.currentTarget;
    const data = new FormData(form);
    const rawFiles = data.getAll("files");
    const files = rawFiles.filter((item): item is File => item instanceof File && item.size > 0);
    const alt = String(data.get("alt") || "").trim().slice(0, 200);

    if (!files.length) {
      setError("Choose at least one image.");
      return;
    }
    if (files.length > MAX_BATCH) {
      setError("Upload up to " + MAX_BATCH + " images at a time.");
      return;
    }

    for (const file of files) {
      if (!ALLOWED.has(file.type)) {
        setError(file.name + ": use JPG, PNG, WebP or AVIF.");
        return;
      }
      if (file.size > MAX_BYTES) {
        setError(file.name + ": image must be 12 MB or smaller.");
        return;
      }
    }

    setBusy(true);
    setFileCount(files.length);
    setFileIndex(1);
    setProgress(0);

    let uploaded = 0;

    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setFileIndex(index + 1);
        setProgress(0);

        const pathname =
          "marketplace-studios/" +
          studioId +
          "/" +
          crypto.randomUUID() +
          "-" +
          safeFileName(file.name);

        const blob = await upload(pathname, file, {
          access: "public",
          handleUploadUrl: "/api/uploads/studio-image",
          clientPayload: JSON.stringify({ studioId }),
          multipart: true,
          onUploadProgress(value) {
            setProgress(Math.round(value.percentage));
          },
        });

        const finalize = await fetch("/api/uploads/studio-image/finalize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            studioId,
            url: blob.url,
            pathname,
            mimeType: file.type,
            sizeBytes: file.size,
            alt: files.length === 1 ? alt : alt || file.name.replace(/\.[^.]+$/, ""),
          }),
        });

        const result = await finalize.json().catch(() => ({}));
        if (!finalize.ok) {
          throw new Error(
            (files.length > 1 ? file.name + ": " : "") +
              (result.error || "Could not save uploaded image."),
          );
        }

        uploaded += 1;
      }

      form.reset();
      setProgress(100);
      setComplete(
        uploaded +
          " photo" +
          (uploaded === 1 ? "" : "s") +
          " added. Use the controls above to choose the cover and order.",
      );
      router.refresh();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Upload failed.",
      );
      if (uploaded > 0) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-5 rounded-2xl border border-zinc-900 bg-black/20 p-4"
    >
      <div className="grid gap-3 md:grid-cols-[1.2fr_1fr_auto]">
        <label>
          <span className="label">Studio photos</span>
          <input
            className="field"
            name="files"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            required
            disabled={busy}
          />
          <span className="mt-1 block text-[9px] text-zinc-600">
            Up to {MAX_BATCH} at once · 12 MB each · JPG, PNG, WebP or AVIF
          </span>
        </label>

        <label>
          <span className="label">Caption</span>
          <input
            className="field"
            name="alt"
            placeholder="Control room / vocal booth"
            disabled={busy}
          />
          <span className="mt-1 block text-[9px] text-zinc-600">
            Optional. For multi-upload, filenames are used when blank.
          </span>
        </label>

        <button disabled={busy} className="button-dark self-end">
          {busy ? "Uploading…" : "Upload photos"}
        </button>
      </div>

      {busy && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-[10px] text-zinc-500">
            <span>
              Photo {fileIndex} of {fileCount}
            </span>
            <b>{progress}%</b>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-900">
            <div
              className="h-full bg-acid transition-all"
              style={{ width: progress + "%" }}
            />
          </div>
        </div>
      )}

      {complete && (
        <p className="mt-3 text-xs leading-5 text-emerald-300">{complete}</p>
      )}
      {error && (
        <p className="mt-3 text-xs leading-5 text-red-300">{error}</p>
      )}
    </form>
  );
}
