"use client";

import { useEffect, useMemo, useState } from "react";

function parts(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return {
    minutes,
    seconds,
    expired: totalSeconds <= 0,
  };
}

export function BookingHoldCountdown({
  expiresAt,
}: {
  expiresAt: string;
}) {
  const target = useMemo(() => new Date(expiresAt).getTime(), [expiresAt]);
  const [remaining, setRemaining] = useState(() => target - Date.now());

  useEffect(() => {
    const update = () => setRemaining(target - Date.now());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [target]);

  const value = parts(remaining);

  if (value.expired) {
    return (
      <span className="font-black text-red-300">
        Hold expired
      </span>
    );
  }

  return (
    <span className="font-black tabular-nums text-amber-200">
      {String(value.minutes).padStart(2, "0")}:
      {String(value.seconds).padStart(2, "0")}
    </span>
  );
}
