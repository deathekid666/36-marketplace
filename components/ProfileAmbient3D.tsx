"use client";

import { useRef } from "react";

export function ProfileAmbient3D() {
  const ref = useRef<HTMLDivElement>(null);

  function move(event: React.PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty("--tilt-x", `${(-y * 10).toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${(x * 14).toFixed(2)}deg`);
    el.style.setProperty("--glow-x", `${((x + 0.5) * 100).toFixed(1)}%`);
    el.style.setProperty("--glow-y", `${((y + 0.5) * 100).toFixed(1)}%`);
  }

  function reset() {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
    el.style.setProperty("--glow-x", "50%");
    el.style.setProperty("--glow-y", "50%");
  }

  return (
    <div
      ref={ref}
      className="lux-profile-ambient"
      onPointerMove={move}
      onPointerLeave={reset}
      aria-hidden="true"
    >
      <div className="lux-profile-ambient-glow" />
      <div className="lux-profile-ambient-card lux-profile-ambient-card-back" />
      <div className="lux-profile-ambient-card lux-profile-ambient-card-mid" />
      <div className="lux-profile-ambient-orb">
        <span className="lux-profile-orb-ring lux-profile-orb-ring-a" />
        <span className="lux-profile-orb-ring lux-profile-orb-ring-b" />
        <span className="lux-profile-orb-ring lux-profile-orb-ring-c" />
        <span className="lux-profile-orb-core">36</span>
      </div>
    </div>
  );
}
