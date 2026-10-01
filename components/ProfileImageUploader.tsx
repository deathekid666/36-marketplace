"use client";

import { upload } from "@vercel/blob/client";
import { ChangeEvent, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Kind = "avatar" | "cover";

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);

export function ProfileImageUploader({
  kind,
  compact = false,
}: {
  kind: Kind;
  compact?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setError("");

    if (!file) return;
    if (!ALLOWED.has(file.type)) {
      setError("Use JPG, PNG, WebP or AVIF.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_BYTES) {
      setError("Image must be 8 MB or smaller.");
      return;
    }

    const safeName =
      file.name
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 100) || "profile-image";

    const pathname =
      "profiles/" +
      "self/" +
      kind +
      "/" +
      crypto.randomUUID() +
      "-" +
      safeName;

    setBusy(true);
    setProgress(0);

    try {
      // The server replaces the public "self" path requirement with the
      // authenticated user's real id by validating the client payload/path.
      const tokenResponse = await fetch("/api/profile-image-path", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, filename: safeName }),
      });

      const pathResult = await tokenResponse.json().catch(() => ({}));
      if (!tokenResponse.ok || !pathResult.pathname) {
        throw new Error(pathResult.error || "Could not prepare upload.");
      }

      const finalPathname = String(pathResult.pathname);

      const blob = await upload(finalPathname, file, {
        access: "public",
        handleUploadUrl: "/api/uploads/profile-image",
        clientPayload: JSON.stringify({ kind }),
        multipart: true,
        onUploadProgress(value) {
          setProgress(Math.round(value.percentage));
        },
      });

      const finalize = await fetch("/api/uploads/profile-image/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          url: blob.url,
          pathname: finalPathname,
          mimeType: file.type,
          sizeBytes: file.size,
        }),
      });

      const result = await finalize.json().catch(() => ({}));
      if (!finalize.ok) {
        throw new Error(result.error || "Could not save uploaded image.");
      }

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
    <div className={compact ? "air-profile-upload compact" : "air-profile-upload"}>
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={choose}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy
          ? "Uploading " + progress + "%"
          : kind === "avatar"
            ? "Change photo"
            : "Change cover"}
      </button>
      {error && <span role="alert">{error}</span>}
    </div>
  );
}
