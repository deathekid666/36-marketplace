"use client";

import { useMemo, useRef, useState } from "react";

import { createStudioWizardAction } from "@/app/owner/actions";
import { StudioLocationFields } from "@/components/StudioLocationFields";

type Category = { value: string; label: string };

const AMENITIES = [
  ["Wi-Fi", "Fast internet for uploads and remote sessions"],
  ["Air conditioning", "Climate-controlled studio"],
  ["Parking", "Parking available for clients"],
  ["Waiting area", "Dedicated waiting or lounge space"],
  ["Kitchen", "Kitchen or refreshments area"],
  ["Restroom", "Restroom available on site"],
  ["Wheelchair access", "Accessible entrance / space"],
  ["Natural light", "Useful for photo and video"],
  ["Soundproofing", "Acoustically isolated space"],
  ["Engineer available", "Engineer can support sessions"],
  ["24/7 access", "Sessions can run outside normal hours"],
  ["Freight elevator", "Useful for large production equipment"],
] as const;

const STEPS = [
  ["Basics", "Studio identity"],
  ["Location", "Where creators arrive"],
  ["Room", "First bookable space"],
  ["Amenities", "What is included"],
  ["Availability", "Starting schedule"],
  ["Policies", "Booking rules"],
] as const;

export function StudioOnboardingWizard({
  categories,
}: {
  categories: Category[];
}) {
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState(categories[0]?.value || "RECORDING");
  const [roomCategory, setRoomCategory] = useState(categories[0]?.value || "RECORDING");
  const formRef = useRef<HTMLFormElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [roomName, setRoomName] = useState("Main studio");
  const [hourlyRate, setHourlyRate] = useState(300);
  const [minimumHours, setMinimumHours] = useState(1);
  const [capacity, setCapacity] = useState(2);
  const [deposit, setDeposit] = useState(30);
  const [cancellation, setCancellation] = useState(24);
  const [schedule, setSchedule] = useState("MON_SAT");

  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  const canContinue = useMemo(() => {
    if (step === 0) return name.trim().length >= 3 && description.trim().length >= 40;
    if (step === 2) {
      return (
        roomName.trim().length >= 2 &&
        hourlyRate >= 1 &&
        minimumHours >= 1 &&
        capacity >= 1
      );
    }
    return true;
  }, [step, name, description, roomName, hourlyRate, minimumHours, capacity]);

  function next() {
    if (!canContinue) return;

    const currentPanel = formRef.current?.querySelector<HTMLElement>(
      '[data-wizard-step="' + step + '"]',
    );
    const controls = currentPanel?.querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
    >("input, select, textarea");

    if (controls) {
      for (const control of Array.from(controls)) {
        if (!control.checkValidity()) {
          control.reportValidity();
          return;
        }
      }
    }

    setStep((current) => Math.min(STEPS.length - 1, current + 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function back() {
    setStep((current) => Math.max(0, current - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <form ref={formRef} action={createStudioWizardAction}>
      <div className="grid gap-7 lg:grid-cols-[250px_1fr]">
        <aside className="self-start lg:sticky lg:top-24">
          <div className="rounded-[28px] border border-[#e6e6e6] bg-white p-5 shadow-[0_12px_40px_rgba(0,0,0,.05)]">
            <div className="flex items-end justify-between gap-3">
              <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#8a8a8a]">
                Listing setup
              </span>
              <b className="text-sm">{progress}%</b>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#f0f0f0]">
              <div className="h-full rounded-full bg-acid transition-all" style={{ width: progress + "%" }} />
            </div>

            <ol className="mt-6 space-y-2">
              {STEPS.map(([title, subtitle], index) => {
                const active = step === index;
                const done = step > index;
                return (
                  <li key={title}>
                    <button
                      type="button"
                      onClick={() => {
                        if (index <= step) setStep(index);
                      }}
                      disabled={index > step}
                      className={
                        "flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition " +
                        (active
                          ? "bg-[#222] text-white"
                          : done
                            ? "bg-acid/[0.06] text-[#222]"
                            : "text-[#a3a3a3]")
                      }
                    >
                      <span
                        className={
                          "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-[10px] font-black " +
                          (active
                            ? "border-white/20 bg-white/10"
                            : done
                              ? "border-acid/40 bg-acid text-black"
                              : "border-[#e1e1e1]")
                        }
                      >
                        {done ? "✓" : index + 1}
                      </span>
                      <span className="min-w-0">
                        <b className="block text-xs">{title}</b>
                        <span className={"mt-0.5 block text-[9px] " + (active ? "text-white/60" : "text-[#a3a3a3]")}>
                          {subtitle}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            <div className="mt-6 rounded-2xl bg-[#f7f7f7] p-4">
              <b className="text-xs">Photos come next</b>
              <p className="mt-1 text-[10px] leading-5 text-[#8a8a8a]">
                36 creates the draft first so uploaded images can be securely attached to the correct studio.
              </p>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <section data-wizard-step="0" className={step === 0 ? "block" : "hidden"}>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-acid">01 · Basics</span>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">Tell creators what this place is.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#717171]">
              Start with the public identity. You can refine everything later before verification.
            </p>

            <div className="mt-7 rounded-[28px] border border-[#e6e6e6] bg-white p-5 sm:p-7">
              <label className="block">
                <span className="label">Studio name</span>
                <input
                  className="field"
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={3}
                  maxLength={120}
                  required
                  placeholder="e.g. Atlas Sound Lab"
                />
              </label>

              <div className="mt-5">
                <span className="label">Primary category</span>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {categories.map((item) => (
                    <label
                      key={item.value}
                      className={
                        "cursor-pointer rounded-2xl border p-4 transition " +
                        (category === item.value
                          ? "border-[#222] bg-[#222] text-white"
                          : "border-[#e5e5e5] bg-white hover:border-[#bdbdbd]")
                      }
                    >
                      <input
                        type="radio"
                        name="primaryCategory"
                        value={item.value}
                        checked={category === item.value}
                        onChange={() => {
                          setCategory(item.value);
                          setRoomCategory(item.value);
                        }}
                        className="sr-only"
                      />
                      <b className="text-sm">{item.label}</b>
                      <span className={"mt-1 block text-[10px] " + (category === item.value ? "text-white/60" : "text-[#8a8a8a]")}>
                        {item.value === "RECORDING" ? "Music, vocals and tracking" :
                         item.value === "PODCAST" ? "Podcast and spoken content" :
                         item.value === "PHOTO" ? "Photography and image production" :
                         item.value === "VIDEO" ? "Film and video production" :
                         item.value === "REHEARSAL" ? "Band and performance rehearsal" :
                         item.value === "DJ" ? "DJ practice and performance" :
                         "Creative production workspace"}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <label className="mt-5 block">
                <span className="label">Description</span>
                <textarea
                  className="field min-h-36 resize-y"
                  name="description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  minLength={40}
                  maxLength={5000}
                  required
                  placeholder="Describe the space, acoustics, setup, ideal sessions and what makes it special…"
                />
                <span className="mt-2 flex justify-between text-[10px] text-[#8a8a8a]">
                  <span>Minimum 40 characters</span>
                  <span>{description.length}/5000</span>
                </span>
              </label>
            </div>
          </section>

          <section data-wizard-step="1" className={step === 1 ? "block" : "hidden"}>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-acid">02 · Location</span>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">Where should creators arrive?</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#717171]">
              Choose the address suggestion so the exact map coordinates are stored with the listing.
            </p>

            <div className="mt-7 space-y-4 rounded-[28px] border border-[#e6e6e6] bg-white p-5 sm:p-7">
              <StudioLocationFields
                city="Casablanca"
                neighborhood=""
                address=""
                latitude=""
                longitude=""
                required
              />
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="sm:col-span-1">
                  <span className="label">Public phone</span>
                  <input className="field" name="phone" required minLength={5} maxLength={40} placeholder="+212…" />
                </label>
                <label>
                  <span className="label">Instagram</span>
                  <input className="field" name="instagram" maxLength={200} placeholder="@studio" />
                </label>
                <label>
                  <span className="label">Website</span>
                  <input className="field" name="website" maxLength={300} placeholder="https://…" />
                </label>
              </div>
              <div className="rounded-2xl bg-[#f7f7f7] p-4 text-xs leading-5 text-[#717171]">
                The public page can show the neighborhood/city while the exact address remains part of the booking and verification workflow.
              </div>
            </div>
          </section>

          <section data-wizard-step="2" className={step === 2 ? "block" : "hidden"}>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-acid">03 · First room</span>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">Create the first bookable space.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#717171]">
              Studios can have multiple rooms. This creates the first one; you can add more immediately afterward.
            </p>

            <div className="mt-7 space-y-5 rounded-[28px] border border-[#e6e6e6] bg-white p-5 sm:p-7">
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="label">Room name</span>
                  <input
                    className="field"
                    name="roomName"
                    value={roomName}
                    onChange={(event) => setRoomName(event.target.value)}
                    required
                    minLength={2}
                    maxLength={120}
                    placeholder="Main studio / Vocal booth A"
                  />
                </label>
                <label>
                  <span className="label">Room category</span>
                  <select
                    className="field"
                    name="roomCategory"
                    value={roomCategory}
                    onChange={(event) => setRoomCategory(event.target.value)}
                  >
                    {categories.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
              </div>

              <label>
                <span className="label">Room description</span>
                <textarea
                  className="field min-h-24 resize-y"
                  name="roomDescription"
                  maxLength={1500}
                  placeholder="Control room, booth, cyclorama, lighting grid, acoustic treatment…"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-3">
                <label>
                  <span className="label">MAD / hour</span>
                  <input
                    className="field"
                    name="hourlyRateMad"
                    type="number"
                    min="1"
                    max="100000"
                    value={hourlyRate}
                    onChange={(event) => setHourlyRate(Number(event.target.value))}
                    required
                  />
                </label>
                <label>
                  <span className="label">Minimum hours</span>
                  <input
                    className="field"
                    name="minimumHours"
                    type="number"
                    min="1"
                    max="12"
                    value={minimumHours}
                    onChange={(event) => setMinimumHours(Number(event.target.value))}
                    required
                  />
                </label>
                <label>
                  <span className="label">Capacity</span>
                  <input
                    className="field"
                    name="capacity"
                    type="number"
                    min="1"
                    max="200"
                    value={capacity}
                    onChange={(event) => setCapacity(Number(event.target.value))}
                    required
                  />
                </label>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-[#e5e5e5] p-4">
                <input name="engineerIncluded" type="checkbox" className="mt-0.5 accent-[#D9FF43]" />
                <span>
                  <b className="block text-sm">Engineer included</b>
                  <span className="mt-1 block text-xs leading-5 text-[#8a8a8a]">
                    The hourly price already includes a studio engineer.
                  </span>
                </span>
              </label>

              <label>
                <span className="label">Main equipment</span>
                <textarea
                  className="field min-h-24 resize-y"
                  name="equipment"
                  maxLength={1800}
                  placeholder={"Shure SM7B, Yamaha HS8, Focusrite Clarett+\nOne item per line or separate with commas"}
                />
                <span className="mt-1 block text-[10px] text-[#8a8a8a]">
                  We will create these as individual equipment items for the room.
                </span>
              </label>
            </div>
          </section>

          <section data-wizard-step="3" className={step === 3 ? "block" : "hidden"}>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-acid">04 · Amenities</span>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">What comes with the studio?</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#717171]">
              Select only amenities that are actually available. You can add custom amenities later.
            </p>

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              {AMENITIES.map(([name, detail]) => (
                <label key={name} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[#e5e5e5] bg-white p-4 transition has-[:checked]:border-acid/50 has-[:checked]:bg-acid/[0.04]">
                  <input type="checkbox" name="amenities" value={name} className="mt-1 accent-[#D9FF43]" />
                  <span>
                    <b className="block text-sm">{name}</b>
                    <span className="mt-1 block text-[10px] leading-5 text-[#8a8a8a]">{detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </section>

          <section data-wizard-step="4" className={step === 4 ? "block" : "hidden"}>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-acid">05 · Availability</span>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">Choose a starting weekly schedule.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#717171]">
              This initializes your calendar. Exact days, blocked periods and vacations can be changed from Owner Calendar later.
            </p>

            <div className="mt-7 space-y-3">
              {[
                ["MON_SAT", "Monday–Saturday", "09:00–22:00 · Sunday closed"],
                ["EVERYDAY", "Every day", "09:00–22:00 · seven days a week"],
                ["WEEKDAYS", "Weekdays", "09:00–18:00 · Saturday/Sunday closed"],
              ].map(([value, title, detail]) => (
                <label
                  key={value}
                  className={
                    "flex cursor-pointer items-center justify-between gap-4 rounded-2xl border bg-white p-5 transition " +
                    (schedule === value ? "border-[#222] ring-1 ring-[#222]" : "border-[#e5e5e5]")
                  }
                >
                  <span>
                    <b className="block text-sm">{title}</b>
                    <span className="mt-1 block text-xs text-[#8a8a8a]">{detail}</span>
                  </span>
                  <input
                    type="radio"
                    name="schedulePreset"
                    value={value}
                    checked={schedule === value}
                    onChange={() => setSchedule(value)}
                    className="accent-[#D9FF43]"
                  />
                </label>
              ))}
            </div>

            <div className="mt-5 rounded-2xl bg-[#f7f7f7] p-4 text-xs leading-5 text-[#717171]">
              Booking availability also checks existing reservations and manual blocked slots, so changing this schedule later will not overwrite confirmed bookings.
            </div>
          </section>

          <section data-wizard-step="5" className={step === 5 ? "block" : "hidden"}>
            <span className="text-xs font-black uppercase tracking-[0.18em] text-acid">06 · Policies</span>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.04em]">Set the initial booking rules.</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#717171]">
              These appear in the creator checkout before they confirm a booking.
            </p>

            <div className="mt-7 space-y-5 rounded-[28px] border border-[#e6e6e6] bg-white p-5 sm:p-7">
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="label">Deposit policy</span>
                  <div className="mt-2 flex items-center gap-3 rounded-2xl border border-[#dddddd] px-4 py-3">
                    <input
                      className="w-full accent-[#D9FF43]"
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={deposit}
                      onChange={(event) => setDeposit(Number(event.target.value))}
                    />
                    <b className="w-14 text-right">{deposit}%</b>
                  </div>
                  <input type="hidden" name="depositPercent" value={deposit} />
                  <span className="mt-2 block text-[10px] leading-4 text-[#8a8a8a]">
                    Stored with the listing and ready for online payment once a payment provider is connected.
                  </span>
                </label>

                <label>
                  <span className="label">Free cancellation</span>
                  <select
                    className="field"
                    name="freeCancellationHours"
                    value={cancellation}
                    onChange={(event) => setCancellation(Number(event.target.value))}
                  >
                    <option value={0}>No free-cancellation window</option>
                    <option value={6}>6 hours before</option>
                    <option value={12}>12 hours before</option>
                    <option value={24}>24 hours before</option>
                    <option value={48}>48 hours before</option>
                    <option value={72}>72 hours before</option>
                    <option value={168}>7 days before</option>
                  </select>
                </label>
              </div>

              <div className="rounded-2xl border border-[#e6e6e6] bg-[#f7f7f7] p-5">
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[#8a8a8a]">Draft summary</span>
                <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2">
                  <div><span className="text-[#8a8a8a]">Studio</span><b className="mt-1 block">{name || "Untitled"}</b></div>
                  <div><span className="text-[#8a8a8a]">Category</span><b className="mt-1 block">{categories.find((item) => item.value === category)?.label || category}</b></div>
                  <div><span className="text-[#8a8a8a]">First room</span><b className="mt-1 block">{roomName}</b></div>
                  <div><span className="text-[#8a8a8a]">Starting price</span><b className="mt-1 block">{hourlyRate} MAD/hour</b></div>
                  <div><span className="text-[#8a8a8a]">Minimum booking</span><b className="mt-1 block">{minimumHours}h</b></div>
                  <div><span className="text-[#8a8a8a]">Capacity</span><b className="mt-1 block">{capacity}</b></div>
                </div>
              </div>

              <div className="rounded-2xl border border-acid/35 bg-acid/[0.04] p-5">
                <b className="text-sm">What happens next?</b>
                <p className="mt-2 text-xs leading-5 text-[#717171]">
                  We create the private draft and take you directly to photos. After media, you can add more rooms, edit equipment, fine-tune the calendar, preview the public page and submit for 36 verification.
                </p>
              </div>
            </div>
          </section>

          <div className="mt-7 flex items-center justify-between border-t border-[#e7e7e7] pt-5">
            <button
              type="button"
              onClick={back}
              disabled={step === 0}
              className="rounded-full border border-[#dddddd] px-5 py-3 text-xs font-black disabled:invisible"
            >
              ← Back
            </button>

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                disabled={!canContinue}
                className="rounded-full bg-[#222] px-6 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-[#e6e6e6] disabled:text-[#9a9a9a]"
              >
                Continue →
              </button>
            ) : (
              <button
                type="submit"
                className="rounded-full bg-acid px-6 py-3 text-xs font-black text-black"
              >
                Create draft & add photos →
              </button>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}
