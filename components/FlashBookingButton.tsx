"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function FlashBookingButton({
  flashSlotId,
  userRole,
  isOwnStudio = false,
}: {
  flashSlotId: string;
  userRole?: "CREATOR" | "STUDIO_OWNER" | "ADMIN" | null;
  isOwnStudio?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function reserve() {
    if (!userRole) {
      router.push(`/auth/login?next=${encodeURIComponent("/now")}`);
      return;
    }
    if (userRole === "ADMIN") {
      setError("Admin accounts do not create marketplace bookings.");
      return;
    }
    if (isOwnStudio) {
      setError("You cannot book your own studio.");
      return;
    }
    setBusy(true);
    setError("");
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flashSlotId }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(data.error || "This slot is no longer available.");
      return;
    }
    router.push(`/creator/bookings/${data.bookingId}?from=now`);
    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy || isOwnStudio}
        onClick={reserve}
        className="w-full rounded-xl bg-acid px-4 py-3 text-xs font-black text-white disabled:opacity-50"
      >
        {busy
          ? "Reserving…"
          : !userRole
            ? "Log in to book"
            : isOwnStudio
              ? "Your studio"
              : "Book this NOW slot"}
      </button>
      {error && <p className="mt-2 text-[11px] leading-5 text-red-300">{error}</p>}
    </div>
  );
}
