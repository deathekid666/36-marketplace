"use client";
import { useEffect } from "react";

export function TrackEvent({ eventType, studioId, bookingId, metadata }: { eventType: string; studioId?: string; bookingId?: string; metadata?: Record<string,string|number|boolean|null> }) {
  useEffect(() => {
    const body = JSON.stringify({ eventType, studioId, bookingId, metadata });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/events", new Blob([body], { type: "application/json" }));
    else fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(()=>undefined);
  }, [eventType, studioId, bookingId, metadata]);
  return null;
}
