"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function UseMyLocation() {
  const router = useRouter();
  const params = useSearchParams();
  const [state, setState] = useState<"idle"|"loading"|"error">("idle");
  function locate() {
    if (!navigator.geolocation) { setState("error"); return; }
    setState("loading");
    navigator.geolocation.getCurrentPosition((position) => {
      const next = new URLSearchParams(params.toString());
      next.set("lat", position.coords.latitude.toFixed(6));
      next.set("lng", position.coords.longitude.toFixed(6));
      if (!next.get("radius")) next.set("radius", "15");
      router.push(`/studios?${next.toString()}`);
      setState("idle");
    }, () => setState("error"), { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }
  return <button type="button" onClick={locate} className="rounded-xl border border-[#dddddd] px-3 py-3 text-xs font-bold text-[#555555] hover:border-[#bdbdbd] hover:text-[#222222]">{state === "loading" ? "Locating…" : state === "error" ? "Location unavailable" : "◎ Near me"}</button>;
}
