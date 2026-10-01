import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { StudioStatusBadge } from "@/components/StudioStatusBadge";
import { StudioLocationFields } from "@/components/StudioLocationFields";
import { StudioImageUploader } from "@/components/StudioImageUploader";
import { requireOwnedStudio } from "@/lib/owner";
import { parseDirectoryProfileV2 } from "@/lib/discovery/profile-v2";
import {
  categoryLabel,
  DAYS,
  STUDIO_CATEGORIES,
  studioCompletion,
  studioOnboardingChecklist,
} from "@/lib/studio";
import {
  addAmenityAction,
  addBlockedSlotAction,
  addStudioAddonAction,
  addEquipmentAction,
  addPhotoAction,
  addRoomAction,
  removeAmenityAction,
  removeBlockedSlotAction,
  removeEquipmentAction,
  removePhotoAction,
  removeStudioAddonAction,
  saveOpeningHoursAction,
  toggleStudioAddonAction,
  submitStudioAction,
  updateRoomAction,
  updateStudioAction,
} from "@/app/owner/actions";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(value);
}

export default async function StudioBuilderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ submit?: string; from?: string; onboarding?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const { user, studio } = await requireOwnedStudio(id);
  const completion = studioCompletion(studio);
  const checklist = studioOnboardingChecklist(studio);
  const hours = new Map(studio.openingHours.map((x) => [x.dayOfWeek, x]));
  const canSubmit =
    completion >= 78 &&
    checklist.ready &&
    studio.status !== "SUSPENDED";
  const directoryProfile = studio.discoveryCandidate
    ? parseDirectoryProfileV2(
        studio.discoveryCandidate.transitions[0]?.metadata,
      )
    : parseDirectoryProfileV2(null);
  const hasDirectoryReference =
    directoryProfile.services.length > 0 ||
    directoryProfile.equipment.length > 0 ||
    Boolean(directoryProfile.openingHours);

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-7xl px-5 py-10">
        <Link href="/owner/studios" className="text-xs font-bold text-zinc-500 hover:text-white">← My studios</Link>

        <div className="mt-7 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <StudioStatusBadge status={studio.status} />
              <span className="text-xs text-zinc-600">/{studio.slug}</span>
            </div>
            <h1 className="mt-4 text-4xl font-black tracking-[-0.045em] sm:text-5xl">{studio.name}</h1>
            <p className="mt-2 text-sm text-zinc-500">{categoryLabel(studio.primaryCategory)} · {studio.neighborhood || studio.city}</p>
          </div>
          <div className="flex min-w-56 flex-col gap-3">
            <div className="rounded-2xl border border-zinc-900 bg-zinc-950 p-5">
              <div className="flex items-end justify-between"><span className="text-xs font-bold uppercase tracking-[0.12em] text-zinc-600">Listing readiness</span><b className="text-2xl text-acid">{completion}%</b></div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-900"><div className="h-full bg-acid" style={{ width: `${completion}%` }} /></div>
            </div>
            <Link
              href={`/owner/studios/${studio.id}/preview`}
              className="rounded-xl border border-zinc-800 bg-white px-5 py-3 text-center text-xs font-black text-[#222] hover:border-acid/40"
            >
              Preview public listing →
            </Link>
          </div>
        </div>

        {query.onboarding === "created" && (
          <div className="mt-6 rounded-2xl border border-acid/35 bg-acid/[0.055] p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <b className="text-sm text-acid">Core listing created</b>
                <p className="mt-2 max-w-2xl text-xs leading-5 text-zinc-500">
                  Your identity, location, first room, starting price, amenities and opening-hours preset are saved.
                  Add real photos below, review the details, then preview and submit the listing for verification.
                </p>
              </div>
              <Link
                href={`/owner/studios/${studio.id}/preview`}
                className="rounded-full border border-acid/30 px-4 py-2 text-xs font-black text-acid"
              >
                Preview so far →
              </Link>
            </div>
          </div>
        )}

        {query.submit === "incomplete" && (
          <div className="mt-6 rounded-xl border border-amber-800/50 bg-amber-950/20 p-4 text-sm text-amber-200">
            Finish every required onboarding item below before submitting for verification.
          </div>
        )}
        {query.submit === "ok" && <div className="mt-6 rounded-xl border border-acid/30 bg-acid/[0.04] p-4 text-sm text-acid">Submitted to 36 for verification.</div>}
        {studio.verificationNote && <div className="mt-6 rounded-xl border border-red-900/60 bg-red-950/20 p-4"><b className="text-sm text-red-300">Verification note</b><p className="mt-1 text-sm leading-6 text-red-200/70">{studio.verificationNote}</p></div>}

        {query.from === "claim" && studio.discoveryCandidate && (
          <div className="mt-6 rounded-2xl border border-emerald-900/40 bg-emerald-950/10 p-5">
            <b className="text-sm text-emerald-300">Verified directory profile imported</b>
            <p className="mt-2 text-xs leading-5 text-zinc-500">
              36 carried over the verified owner profile where the marketplace has an exact matching field.
              Description, contact/location details and existing directory photos are reused automatically.
              Pricing, room inventory and structured availability still require your confirmation.
            </p>
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-zinc-900 bg-zinc-950/60 p-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.13em] text-zinc-600">
                Enable booking checklist
              </span>
              <h2 className="mt-1 text-xl font-black">
                {checklist.completeCount}/{checklist.totalCount} required items complete
              </h2>
            </div>
            <span
              className={
                checklist.ready
                  ? "rounded-full border border-emerald-900/50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-emerald-300"
                  : "rounded-full border border-amber-900/50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-amber-300"
              }
            >
              {checklist.ready ? "Ready for review" : "Setup required"}
            </span>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
            {checklist.items.map((item) => (
              <div
                key={item.key}
                className={
                  item.complete
                    ? "rounded-xl border border-emerald-900/30 bg-emerald-950/10 p-3"
                    : "rounded-xl border border-zinc-900 bg-black/20 p-3"
                }
              >
                <span className={item.complete ? "text-emerald-300" : "text-zinc-700"}>
                  {item.complete ? "✓" : "○"}
                </span>
                <b className="ml-2 text-xs">{item.label}</b>
                <p className="mt-1 text-[10px] leading-4 text-zinc-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.08fr_.92fr]">
          <div className="space-y-6">
            <section className="panel">
              <div className="flex items-center justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">01 · Identity</span><h2 className="mt-2 text-2xl font-black">Studio profile</h2></div><span className="text-xs text-zinc-600">Public listing</span></div>
              <form action={updateStudioAction} className="mt-6 space-y-4">
                <input type="hidden" name="studioId" value={studio.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <label><span className="label">Studio name</span><input className="field" name="name" defaultValue={studio.name} required /></label>
                  <label><span className="label">Primary category</span><select className="field" name="primaryCategory" defaultValue={studio.primaryCategory}>{STUDIO_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
                </div>
                <label><span className="label">Description</span><textarea className="field min-h-32 resize-y" name="description" defaultValue={studio.description} placeholder="Describe the space, sound, setup, ideal use cases and what makes it special…" /></label>
                <StudioLocationFields city={studio.city} neighborhood={studio.neighborhood} address={studio.address} latitude={studio.latitude?.toString() || ""} longitude={studio.longitude?.toString() || ""} />
                <div className="grid gap-4 sm:grid-cols-3">
                  <label><span className="label">Phone</span><input className="field" name="phone" defaultValue={studio.phone} /></label>
                  <label><span className="label">Instagram</span><input className="field" name="instagram" defaultValue={studio.instagram} placeholder="@studio" /></label>
                  <label><span className="label">Website</span><input className="field" name="website" defaultValue={studio.website} placeholder="https://…" /></label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label><span className="label">Booking deposit %</span><input className="field" name="depositPercent" type="number" min="0" max="100" defaultValue={studio.depositPercent} /><span className="mt-2 block text-[10px] leading-4 text-zinc-600">36 reserves this percentage before a booking becomes confirmed.</span></label>
                  <label><span className="label">Free cancellation hours</span><input className="field" name="freeCancellationHours" type="number" min="0" max="336" defaultValue={studio.freeCancellationHours} /><span className="mt-2 block text-[10px] leading-4 text-zinc-600">Paid deposits are refund-eligible when the creator cancels before this cutoff.</span></label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Legal / invoice name</span><input className="field" name="legalName" defaultValue={studio.legalName}/></label><label><span className="label">Tax rate %</span><input className="field" name="taxRatePercent" type="number" min="0" max="30" step="0.01" defaultValue={(studio.taxRateBps/100).toFixed(2)}/></label></div><div className="grid gap-4 sm:grid-cols-2"><label><span className="label">ICE</span><input className="field" name="ice" defaultValue={studio.ice}/></label><label><span className="label">Tax ID / IF</span><input className="field" name="taxId" defaultValue={studio.taxId}/></label></div>
                <button className="button-dark">Save profile</button>
              </form>
            </section>

            <section className="panel">
              <div className="flex items-center justify-between"><div><span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">02 · Inventory</span><h2 className="mt-2 text-2xl font-black">Rooms & pricing</h2></div><b className="text-sm text-zinc-500">{studio.rooms.length} room{studio.rooms.length === 1 ? "" : "s"}</b></div>
              <div className="mt-6 space-y-4">
                {studio.rooms.map((room) => (
                  <article key={room.id} className="rounded-2xl border border-zinc-900 bg-black/25 p-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-acid">{categoryLabel(room.category)}</span><h3 className="mt-1 text-xl font-black">{room.name}</h3><p className="mt-1 text-xs text-zinc-600">Capacity {room.capacity} · Minimum {room.minimumHours}h · Engineer {room.engineerIncluded ? "included" : "optional / not included"}</p></div>
                      <div className="text-right"><b className="text-2xl font-black">{room.hourlyRateMad} MAD</b><span className="block text-[10px] uppercase tracking-[0.12em] text-zinc-600">per hour</span></div>
                    </div>
                    {room.description && <p className="mt-4 text-sm leading-6 text-zinc-500">{room.description}</p>}
                    <div className="mt-4 flex flex-wrap gap-2">{room.equipment.length ? room.equipment.map((e) => <form key={e.id} action={removeEquipmentAction}><input type="hidden" name="studioId" value={studio.id} /><input type="hidden" name="equipmentId" value={e.id} /><button title="Remove equipment" className="rounded-full border border-zinc-800 px-3 py-1 text-[10px] text-zinc-400 hover:border-red-900 hover:text-red-300">{e.name}{e.quantity > 1 ? ` ×${e.quantity}` : ""} ×</button></form>) : <span className="text-xs text-zinc-700">No equipment added yet.</span>}</div>
                    <form action={addEquipmentAction} className="mt-4 grid gap-2 sm:grid-cols-[1fr_90px_auto]">
                      <input type="hidden" name="studioId" value={studio.id} /><input type="hidden" name="roomId" value={room.id} />
                      <input className="field" name="name" placeholder="Add equipment: Shure SM7B" required />
                      <input className="field" name="quantity" type="number" min="1" defaultValue="1" />
                      <button className="button-dark">Add</button>
                    </form>
                    <details className="mt-4 border-t border-zinc-900 pt-4">
                      <summary className="cursor-pointer text-xs font-bold text-zinc-500 hover:text-white">Edit room details</summary>
                      <form action={updateRoomAction} className="mt-4 space-y-3">
                        <input type="hidden" name="studioId" value={studio.id} /><input type="hidden" name="roomId" value={room.id} />
                        <div className="grid gap-3 sm:grid-cols-2"><input className="field" name="name" defaultValue={room.name} required /><select className="field" name="category" defaultValue={room.category}>{STUDIO_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
                        <textarea className="field" name="description" defaultValue={room.description} />
                        <div className="grid gap-3 sm:grid-cols-3"><input className="field" name="hourlyRateMad" type="number" min="1" defaultValue={room.hourlyRateMad} /><input className="field" name="minimumHours" type="number" min="1" defaultValue={room.minimumHours} /><input className="field" name="capacity" type="number" min="1" defaultValue={room.capacity} /></div>
                        <div className="flex flex-wrap gap-5"><label className="flex items-center gap-2 text-xs text-zinc-400"><input name="engineerIncluded" type="checkbox" defaultChecked={room.engineerIncluded} className="accent-[#d9ff43]" /> Engineer included</label><label className="flex items-center gap-2 text-xs text-zinc-400"><input name="active" type="checkbox" defaultChecked={room.active} className="accent-[#d9ff43]" /> Active / bookable</label></div>
                        <button className="button-dark">Save room</button>
                      </form>
                    </details>
                  </article>
                ))}
              </div>
              <details className="mt-5 rounded-2xl border border-zinc-900 bg-zinc-950/50 p-5" open={studio.rooms.length === 0}>
                <summary className="cursor-pointer text-sm font-black">+ Add room</summary>
                <form action={addRoomAction} className="mt-5 space-y-4">
                  <input type="hidden" name="studioId" value={studio.id} />
                  <div className="grid gap-4 sm:grid-cols-2"><label><span className="label">Room name</span><input className="field" name="name" required placeholder="Vocal Booth A" /></label><label><span className="label">Category</span><select className="field" name="category">{STUDIO_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label></div>
                  <label><span className="label">Description</span><textarea className="field" name="description" placeholder="Room acoustics, setup, ideal use…" /></label>
                  <div className="grid gap-4 sm:grid-cols-3"><label><span className="label">MAD / hour</span><input className="field" name="hourlyRateMad" type="number" min="1" defaultValue="250" required /></label><label><span className="label">Minimum hours</span><input className="field" name="minimumHours" type="number" min="1" defaultValue="1" /></label><label><span className="label">Capacity</span><input className="field" name="capacity" type="number" min="1" defaultValue="2" /></label></div>
                  <label className="flex items-center gap-3 text-sm text-zinc-400"><input name="engineerIncluded" type="checkbox" className="h-4 w-4 accent-[#d9ff43]" /> Engineer included in the hourly rate</label>
                  <button className="button-dark">Create room</button>
                </form>
              </details>
            </section>

            <section id="media" className="panel scroll-mt-28">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">03 · Media & amenities</span><h2 className="mt-2 text-2xl font-black">Make the listing credible</h2>
              <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {studio.photos.map((photo) => <div key={photo.id} className="overflow-hidden rounded-xl border border-zinc-900 bg-zinc-950"><img src={photo.url} alt={photo.alt || studio.name} className="h-36 w-full object-cover" /><div className="flex items-center justify-between gap-2 p-3 text-xs text-zinc-600"><span>{photo.alt || "Studio photo"}</span><form action={removePhotoAction}><input type="hidden" name="studioId" value={studio.id} /><input type="hidden" name="photoId" value={photo.id} /><button className="text-red-400/70 hover:text-red-300">Remove</button></form></div></div>)}
                {studio.photos.length === 0 && <div className="rounded-xl border border-dashed border-zinc-800 p-8 text-center text-xs text-zinc-600 sm:col-span-2 lg:col-span-3">Upload at least one real studio photo for verification.</div>}
              </div>
              <StudioImageUploader studioId={studio.id}/><details className="mt-4"><summary className="cursor-pointer text-xs text-zinc-600">Or add an existing image URL</summary><form action={addPhotoAction} className="mt-5 grid gap-3 md:grid-cols-[1.5fr_1fr_100px_auto]"><input type="hidden" name="studioId" value={studio.id} /><input className="field" name="url" type="url" required placeholder="https://…/studio.jpg" /><input className="field" name="alt" placeholder="Control room" /><input className="field" name="sortOrder" type="number" min="0" defaultValue="0" /><button className="button-dark">Add photo</button></form></details>
              <div className="mt-6 border-t border-zinc-900 pt-5"><div className="flex flex-wrap gap-2">{studio.amenities.map((a) => <form key={a.id} action={removeAmenityAction}><input type="hidden" name="studioId" value={studio.id} /><input type="hidden" name="amenityId" value={a.id} /><button className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400 hover:border-red-900 hover:text-red-300">{a.name} ×</button></form>)}</div><form action={addAmenityAction} className="mt-4 flex gap-2"><input type="hidden" name="studioId" value={studio.id} /><input className="field" name="name" required placeholder="Parking, Wi‑Fi, AC, waiting area…" /><button className="button-dark">Add amenity</button></form></div>
            </section>
          </div>

          <div className="space-y-6">
            {hasDirectoryReference && (
              <section className="panel">
                <span className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-300">
                  Imported owner reference
                </span>
                <h2 className="mt-2 text-2xl font-black">Directory profile data</h2>
                <p className="mt-2 text-sm leading-6 text-zinc-500">
                  This information came from the verified owner directory profile. Review it before using it for booking inventory.
                </p>

                {directoryProfile.services.length > 0 && (
                  <div className="mt-5">
                    <span className="label">Services previously listed</span>
                    <div className="flex flex-wrap gap-2">
                      {directoryProfile.services.map((service) => (
                        <span key={service} className="rounded-full border border-sky-900/40 px-3 py-1 text-[10px] font-bold text-sky-300">
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {directoryProfile.equipment.length > 0 && (
                  <div className="mt-5">
                    <span className="label">Equipment previously listed</span>
                    {studio.rooms.length === 0 ? (
                      <p className="mt-2 rounded-xl border border-dashed border-zinc-800 p-4 text-xs text-zinc-600">
                        Add a room first, then you can copy these equipment items into the room inventory.
                      </p>
                    ) : (
                      <div className="mt-2 space-y-2">
                        {directoryProfile.equipment.map((equipment) => (
                          <form
                            key={equipment}
                            action={addEquipmentAction}
                            className="grid gap-2 rounded-xl border border-zinc-900 p-3 sm:grid-cols-[1fr_180px_auto]"
                          >
                            <input type="hidden" name="studioId" value={studio.id} />
                            <input type="hidden" name="name" value={equipment} />
                            <input type="hidden" name="quantity" value="1" />
                            <b className="self-center text-xs text-zinc-300">{equipment}</b>
                            <select name="roomId" className="field py-2">
                              {studio.rooms.map((room) => (
                                <option key={room.id} value={room.id}>
                                  {room.name}
                                </option>
                              ))}
                            </select>
                            <button className="button-dark">Copy to room</button>
                          </form>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {directoryProfile.openingHours && (
                  <div className="mt-5 rounded-xl border border-zinc-900 bg-black/20 p-4">
                    <span className="label">Previous opening-hours text</span>
                    <p className="whitespace-pre-line text-xs leading-5 text-zinc-400">
                      {directoryProfile.openingHours}
                    </p>
                    <p className="mt-2 text-[10px] leading-4 text-zinc-700">
                      Use this only as a reference; the booking engine requires the structured weekly schedule below.
                    </p>
                  </div>
                )}
              </section>
            )}

            <section className="panel">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">04 · Add-ons</span><h2 className="mt-2 text-2xl font-black">Sell extras with the room</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500">Examples: engineer, extra camera, lighting kit, vocal tuning, extra microphone or editing time.</p>
              <div className="mt-5 space-y-2">{studio.addons.length === 0 ? <p className="rounded-xl border border-dashed border-zinc-800 p-4 text-xs text-zinc-600">No add-ons yet.</p> : studio.addons.map((addon) => <div key={addon.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-900 p-4"><div><b className="text-sm">{addon.name}</b><span className="mt-1 block text-xs text-zinc-600">{addon.roomId ? studio.rooms.find((r)=>r.id===addon.roomId)?.name || "Room" : "All rooms"} · {addon.unitPriceMad} MAD / {addon.unitLabel} · {addon.active ? "active" : "hidden"}</span>{addon.description && <p className="mt-1 text-xs text-zinc-500">{addon.description}</p>}</div><div className="flex gap-2"><form action={toggleStudioAddonAction}><input type="hidden" name="studioId" value={studio.id}/><input type="hidden" name="addonId" value={addon.id}/><button className="button-dark">{addon.active ? "Hide" : "Activate"}</button></form><form action={removeStudioAddonAction}><input type="hidden" name="studioId" value={studio.id}/><input type="hidden" name="addonId" value={addon.id}/><button className="rounded-lg border border-red-900/50 px-3 py-2 text-xs font-bold text-red-300">Delete</button></form></div></div>)}</div>
              <form action={addStudioAddonAction} className="mt-5 space-y-3"><input type="hidden" name="studioId" value={studio.id}/><div className="grid gap-3 sm:grid-cols-2"><label><span className="label">Add-on name</span><input className="field" name="name" required placeholder="Recording engineer"/></label><label><span className="label">Room</span><select className="field" name="roomId"><option value="">All rooms</option>{studio.rooms.map((room)=><option key={room.id} value={room.id}>{room.name}</option>)}</select></label></div><label><span className="label">Description</span><input className="field" name="description" placeholder="What's included?"/></label><div className="grid gap-3 sm:grid-cols-2"><label><span className="label">Price MAD</span><input className="field" name="unitPriceMad" type="number" min="1" defaultValue="100" required/></label><label><span className="label">Unit</span><input className="field" name="unitLabel" defaultValue="item" placeholder="hour / item / session"/></label></div><button className="button-dark w-full">Add extra</button></form>
            </section>

            <section className="panel">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">05 · Weekly schedule</span><h2 className="mt-2 text-2xl font-black">Opening hours</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500">This is the base availability. Bookings and blocked slots will remove time from it.</p>
              <form action={saveOpeningHoursAction} className="mt-6 space-y-2">
                <input type="hidden" name="studioId" value={studio.id} />
                {DAYS.map((day, index) => {
                  const row = hours.get(index);
                  return <div key={day} className="grid grid-cols-[90px_1fr_1fr_auto] items-center gap-2 rounded-xl border border-zinc-900 p-3"><b className="text-xs">{day.slice(0,3)}</b><input name={`open_${index}`} type="time" className="field py-2" defaultValue={row?.opensAt || "09:00"} /><input name={`close_${index}`} type="time" className="field py-2" defaultValue={row?.closesAt || "22:00"} /><label className="flex items-center gap-1 text-[10px] text-zinc-600"><input name={`closed_${index}`} type="checkbox" defaultChecked={row?.closed ?? false} className="accent-[#d9ff43]" /> closed</label></div>;
                })}
                <button className="button-dark mt-3 w-full">Save opening hours</button>
              </form>
            </section>

            <section className="panel">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">06 · Exceptions</span><h2 className="mt-2 text-2xl font-black">Block unavailable time</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-500">Maintenance, private sessions or other commitments can block a room before the booking engine goes live.</p>
              {studio.rooms.length > 0 ? <form action={addBlockedSlotAction} className="mt-5 space-y-3"><input type="hidden" name="studioId" value={studio.id} /><label><span className="label">Room</span><select className="field" name="roomId">{studio.rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label><span className="label">From</span><input className="field" name="startAt" type="datetime-local" required /></label><label><span className="label">To</span><input className="field" name="endAt" type="datetime-local" required /></label></div><label><span className="label">Reason</span><input className="field" name="reason" placeholder="Maintenance / private booking" /></label><button className="button-dark w-full">Block time</button></form> : <p className="mt-5 rounded-xl border border-dashed border-zinc-800 p-5 text-xs text-zinc-600">Add a room first.</p>}
              <div className="mt-5 space-y-2">{studio.rooms.flatMap((room) => room.blockedSlots.map((slot) => <div key={slot.id} className="flex items-start justify-between gap-3 rounded-xl border border-zinc-900 bg-black/20 p-3"><div><b className="text-xs">{room.name}</b><span className="mt-1 block text-[11px] text-zinc-500">{formatDate(slot.startAt)} → {formatDate(slot.endAt)}</span>{slot.reason && <span className="mt-1 block text-[10px] text-zinc-700">{slot.reason}</span>}</div><form action={removeBlockedSlotAction}><input type="hidden" name="studioId" value={studio.id} /><input type="hidden" name="slotId" value={slot.id} /><button className="text-[10px] text-red-400/70 hover:text-red-300">Remove</button></form></div>))}</div>
            </section>

            <section className="rounded-2xl border border-acid/20 bg-acid/[0.035] p-6">
              <span className="text-xs font-bold uppercase tracking-[0.14em] text-acid">07 · Trust</span><h2 className="mt-2 text-2xl font-black">36 Verification</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-400">Submit when the listing accurately represents the physical studio. Admin reviews the profile before the verified badge can appear in search.</p>
              <div className="mt-5 grid grid-cols-2 gap-3 text-xs"><div className="rounded-xl bg-black/25 p-3"><b className="block text-zinc-200">Readiness</b><span className="text-zinc-600">{completion}% complete</span></div><div className="rounded-xl bg-black/25 p-3"><b className="block text-zinc-200">Status</b><span className="text-zinc-600">{studio.status}</span></div></div>
              {studio.status === "SUBMITTED" ? <div className="mt-5 rounded-xl border border-amber-800/40 p-4 text-sm text-amber-300">Waiting for admin review.</div> : studio.status === "VERIFIED" ? <div className="mt-5 rounded-xl border border-acid/40 p-4 text-sm text-acid">✓ Verified by 36.</div> : <form action={submitStudioAction} className="mt-5"><input type="hidden" name="studioId" value={studio.id} /><button disabled={!canSubmit} className="w-full rounded-xl bg-acid px-5 py-3.5 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-600">Submit for verification</button>{!canSubmit && <p className="mt-2 text-center text-[10px] text-zinc-600">Complete all 5 required onboarding items and reach at least 78% listing readiness.</p>}</form>}
            </section>
          </div>
        </div>
      </section>
    </main>
  );
}
