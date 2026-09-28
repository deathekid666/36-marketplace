"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type RoomOption = {
  id: string;
  name: string;
  hourlyRateMad: number;
  minimumHours: number;
  engineerIncluded: boolean;
};

type AddonOption = {
  id: string;
  roomId: string | null;
  name: string;
  description: string;
  unitPriceMad: number;
  unitLabel: string;
};

type Slot = { startAt: string; endAt: string; label: string };

function defaultDate() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function BookingWidget({
  rooms,
  addons = [],
  userRole,
  depositPercent,
  initialDate,
  initialDurationHours,
  initialStartAt,
  taxRateBps = 0,
}: {
  rooms: RoomOption[];
  addons?: AddonOption[];
  userRole?: "CREATOR" | "STUDIO_OWNER" | "ADMIN" | null;
  depositPercent: number;
  initialDate?: string;
  initialDurationHours?: number;
  initialStartAt?: string;
  taxRateBps?: number;
}) {
  const router = useRouter();
  const [roomId, setRoomId] = useState(rooms[0]?.id || "");
  const room = useMemo(() => rooms.find((x) => x.id === roomId) || rooms[0], [rooms, roomId]);
  const applicableAddons = useMemo(() => addons.filter((x) => !x.roomId || x.roomId === roomId), [addons, roomId]);
  const [selectedAddons, setSelectedAddons] = useState<Record<string, number>>({});
  const [date, setDate] = useState(initialDate || defaultDate());
  const [durationHours, setDurationHours] = useState(Math.max(room?.minimumHours || 1, initialDurationHours || 1));
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [booking, setBooking] = useState(false);
  const [message, setMessage] = useState("");
  const [promoCode, setPromoCode] = useState("");

  useEffect(() => {
    if (!room) return;
    setDurationHours((current) => Math.max(room.minimumHours, current));
    setSelectedAddons((current) => Object.fromEntries(Object.entries(current).filter(([id]) => applicableAddons.some((x) => x.id === id))));
  }, [room, applicableAddons]);

  useEffect(() => {
    if (!roomId || !date) return;
    const controller = new AbortController();
    setLoading(true);
    setSelected("");
    setMessage("");
    fetch(`/api/availability?roomId=${encodeURIComponent(roomId)}&date=${encodeURIComponent(date)}&durationMinutes=${durationHours * 60}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const next = Array.isArray(data.slots) ? data.slots : [];
        setSlots(next);
        if (initialStartAt && next.some((slot: Slot) => slot.startAt === initialStartAt)) setSelected(initialStartAt);
      })
      .catch((error) => { if (error?.name !== "AbortError") setSlots([]); })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [roomId, date, durationHours, initialStartAt]);

  async function book() {
    if (!selected) return;
    if (!userRole) {
      router.push(`/auth/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (userRole !== "CREATOR") {
      setMessage("Booking requires a Creator account.");
      return;
    }
    setBooking(true);
    setMessage("");
    const response = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId,
        startAt: selected,
        durationMinutes: durationHours * 60,
        addons: Object.entries(selectedAddons).map(([addonId, quantity]) => ({ addonId, quantity })),
        promoCode: promoCode.trim(),
      }),
    });
    const data = await response.json().catch(() => ({}));
    setBooking(false);
    if (!response.ok) {
      setMessage(data.error || "Booking failed.");
      return;
    }
    router.push(data.redirectTo || "/creator/bookings");
    router.refresh();
  }

  if (!room) return <p className="text-sm text-zinc-500">No bookable room is available.</p>;

  const roomTotal = room.hourlyRateMad * durationHours;
  const addonTotal = applicableAddons.reduce((sum, addon) => sum + addon.unitPriceMad * (selectedAddons[addon.id] || 0), 0);
  const subtotal = roomTotal + addonTotal;
  const estimatedTax = Math.round((subtotal * taxRateBps) / 10000);
  const estimatedTotal = subtotal + estimatedTax;
  const estimatedDeposit = Math.round((estimatedTotal * depositPercent) / 100);

  return (
    <div>
      <div className="grid gap-3">
        <label><span className="label">Room</span><select className="field" value={roomId} onChange={(e) => setRoomId(e.target.value)}>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name} · {r.hourlyRateMad} MAD/h</option>)}</select></label>
        <div className="grid grid-cols-2 gap-3">
          <label><span className="label">Date</span><input className="field" type="date" value={date} min={new Date().toISOString().slice(0,10)} onChange={(e) => setDate(e.target.value)} /></label>
          <label><span className="label">Duration</span><select className="field" value={durationHours} onChange={(e) => setDurationHours(Number(e.target.value))}>{Array.from({ length: Math.max(1, 13 - room.minimumHours) }, (_, i) => room.minimumHours + i).filter((h) => h <= 12).map((h) => <option key={h} value={h}>{h} hour{h === 1 ? "" : "s"}</option>)}</select></label>
        </div>
      </div>

      {applicableAddons.length > 0 && <div className="mt-5"><span className="label">Optional add-ons</span><div className="mt-2 space-y-2">{applicableAddons.map((addon) => {
        const qty = selectedAddons[addon.id] || 0;
        return <div key={addon.id} className={`rounded-xl border p-3 ${qty ? "border-acid/40 bg-acid/[0.03]" : "border-zinc-900 bg-black/20"}`}><div className="flex items-start justify-between gap-3"><label className="flex cursor-pointer items-start gap-3"><input type="checkbox" className="mt-1 accent-[#d9ff43]" checked={qty > 0} onChange={(e) => setSelectedAddons((cur) => ({ ...cur, [addon.id]: e.target.checked ? 1 : 0 }))} /><span><b className="block text-xs">{addon.name}</b><span className="mt-1 block text-[10px] leading-4 text-zinc-600">{addon.description || `${addon.unitPriceMad} MAD / ${addon.unitLabel}`}</span></span></label><b className="text-xs text-acid">+{addon.unitPriceMad} MAD</b></div>{qty > 0 && <div className="mt-2 flex items-center justify-end gap-2"><span className="text-[10px] text-zinc-600">Qty</span><select className="rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs" value={qty} onChange={(e) => setSelectedAddons((cur) => ({ ...cur, [addon.id]: Number(e.target.value) }))}>{[1,2,3,4,5].map((n) => <option key={n} value={n}>{n}</option>)}</select></div>}</div>;
      })}</div></div>}

      <div className="mt-5">
        <div className="flex items-center justify-between"><span className="label mb-0">Live availability</span><span className="text-[10px] text-zinc-600">Casablanca time</span></div>
        {loading ? <p className="mt-3 text-xs text-zinc-600">Checking live availability…</p> : slots.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-zinc-800 p-4 text-xs leading-5 text-zinc-600">No available {durationHours}h slot for this date.</p> : <div className="mt-3 grid grid-cols-2 gap-2">{slots.map((slot) => <button key={slot.startAt} type="button" onClick={() => setSelected(slot.startAt)} className={`rounded-lg border px-3 py-2 text-xs font-bold transition ${selected === slot.startAt ? "border-acid bg-acid text-black" : "border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-600"}`}>{slot.label}</button>)}</div>}
      </div>

      <div className="mt-5"><span className="label">Promo code</span><input className="field" value={promoCode} onChange={(e)=>setPromoCode(e.target.value.toUpperCase())} maxLength={32} placeholder="Optional" /><span className="mt-1 block text-[10px] text-zinc-600">Validated securely when you reserve. Discount is applied before tax.</span></div>

      <div className="mt-5 rounded-xl bg-black/30 p-4">
        <div className="flex justify-between text-xs"><span className="text-zinc-500">Room</span><b>{roomTotal} MAD</b></div>
        {addonTotal > 0 && <div className="mt-2 flex justify-between text-xs"><span className="text-zinc-500">Add-ons</span><b>{addonTotal} MAD</b></div>}
        {estimatedTax > 0 && <div className="mt-2 flex justify-between text-xs"><span className="text-zinc-500">Estimated tax ({(taxRateBps/100).toFixed(2)}%)</span><b>{estimatedTax} MAD</b></div>}
        <div className="mt-2 flex justify-between border-t border-zinc-900 pt-2 text-xs"><span className="text-zinc-400">Estimated total</span><b>{estimatedTotal} MAD</b></div>
        <div className="mt-2 flex justify-between text-xs"><span className="text-zinc-500">Deposit ({depositPercent}%)</span><b className="text-acid">{estimatedDeposit} MAD</b></div>
      </div>

      {message && <p className="mt-3 text-xs leading-5 text-amber-300">{message}</p>}
      <button type="button" disabled={!selected || booking} onClick={book} className="mt-4 w-full rounded-xl bg-acid px-5 py-3.5 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600">{booking ? "Reserving…" : !userRole ? "Log in to book" : "Reserve this slot"}</button>
    </div>
  );
}
