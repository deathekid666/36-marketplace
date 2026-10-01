"use client";

import { upload } from "@vercel/blob/client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export function StudioImageUploader({ studioId }: { studioId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    const alt = String(data.get("alt") || "").trim().slice(0, 200);

    if (!(file instanceof File)) {
      setError("Choose an image.");
      return;
    }
    if (!ALLOWED.has(file.type)) {
      setError("Use JPG, PNG, WebP or AVIF.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      setError("Image must be 12 MB or smaller.");
      return;
    }

    const safeName =
      file.name
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 120) || "studio-photo";

    const pathname =
      "marketplace-studios/" +
      studioId +
      "/" +
      crypto.randomUUID() +
      "-" +
      safeName;

    setBusy(true);
    setProgress(0);

    try {
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
          alt,
        }),
      });

      const result = await finalize.json().catch(() => ({}));
      if (!finalize.ok) {
        throw new Error(result.error || "Could not save uploaded image.");
      }

      form.reset();
      setProgress(100);
      router.refresh();
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Upload failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]"
    >
      <input
        className="field"
        name="file"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        required
      />
      <input
        className="field"
        name="alt"
        placeholder="Control room / vocal booth"
      />
      <button disabled={busy} className="button-dark">
        {busy ? "Uploading " + progress + "%" : "Upload photo"}
      </button>
      {busy && (
        <div className="md:col-span-3 h-1.5 overflow-hidden rounded-full bg-zinc-900">
          <div
            className="h-full bg-acid transition-all"
            style={{ width: progress + "%" }}
          />
        </div>
      )}
      {error && (
        <p className="text-xs text-red-300 md:col-span-3">{error}</p>
      )}
    </form>
  );
}
