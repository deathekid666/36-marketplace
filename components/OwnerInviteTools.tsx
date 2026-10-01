"use client";

import { useMemo, useState } from "react";

export function OwnerInviteTools({
  studioName,
  slug,
}: {
  studioName: string;
  slug: string;
}) {
  const [message, setMessage] = useState("");

  const relativeUrl =
    "/discover/" +
    encodeURIComponent(slug) +
    "/claim?source=owner-invite";

  const outreach = useMemo(
    () =>
      "Hi, 36 found " +
      studioName +
      " in our public studio directory. If you manage or own this studio, you can verify ownership and manage the public profile here: " +
      relativeUrl +
      " — claiming is free and does not make the studio bookable automatically.",
    [studioName, relativeUrl],
  );

  async function copy(value: string, success: string) {
    const absolute = value.startsWith("/")
      ? window.location.origin + value
      : value;

    try {
      await navigator.clipboard.writeText(absolute);
      setMessage(success);
    } catch {
      setMessage(absolute);
    }
  }

  async function copyOutreach() {
    const absolute =
      window.location.origin + relativeUrl;
    await copy(
      outreach.replace(relativeUrl, absolute),
      "Invite message copied.",
    );
  }

  return (
    <div className="rounded-2xl border border-sky-900/40 bg-sky-950/[0.08] p-5">
      <span className="text-[10px] font-black uppercase tracking-[0.12em] text-sky-300">
        Owner acquisition
      </span>
      <h3 className="mt-2 text-lg font-black">
        Invite the real studio owner
      </h3>
      <p className="mt-2 text-xs leading-5 text-zinc-600">
        The link opens the existing secure claim flow. The owner still needs
        a Studio Owner account, verified email, evidence and Admin approval.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() =>
            copy(relativeUrl, "Claim link copied.")
          }
          className="rounded-xl bg-sky-300 px-4 py-3 text-xs font-black text-black"
        >
          Copy claim link
        </button>
        <button
          type="button"
          onClick={copyOutreach}
          className="button-dark"
        >
          Copy invite message
        </button>
      </div>

      {message && (
        <p className="mt-3 break-all text-[10px] leading-5 text-emerald-300">
          {message}
        </p>
      )}
    </div>
  );
}
