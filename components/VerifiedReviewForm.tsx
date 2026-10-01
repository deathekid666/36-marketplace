"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

import { submitReviewAction } from "@/app/bookings/actions";

const FIELDS = [
  ["rating", "Overall", "How was the complete studio experience?"],
  ["accuracy", "Listing accuracy", "Did the studio match its page?"],
  ["equipment", "Equipment", "Was the listed gear available and usable?"],
  ["communication", "Communication", "How clear and responsive was the studio?"],
] as const;

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      disabled={pending}
      className="rounded-xl bg-acid px-5 py-3 text-xs font-black text-black disabled:cursor-not-allowed disabled:opacity-50"
    >
      {pending ? "Publishing…" : "Publish verified review"}
    </button>
  );
}

export function VerifiedReviewForm({ bookingId }: { bookingId: string }) {
  const [ratings, setRatings] = useState<Record<string, number>>({
    rating: 5,
    accuracy: 5,
    equipment: 5,
    communication: 5,
  });
  const [comment, setComment] = useState("");

  return (
    <form action={submitReviewAction} className="mt-5 space-y-5">
      <input type="hidden" name="bookingId" value={bookingId} />

      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([name, label, hint]) => (
          <div key={name} className="rounded-2xl border border-zinc-900 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <b className="text-sm">{label}</b>
                <p className="mt-1 text-[10px] leading-4 text-zinc-600">{hint}</p>
              </div>
              <b className="text-sm text-acid">{ratings[name]}/5</b>
            </div>

            <input type="hidden" name={name} value={ratings[name]} />

            <div className="mt-3 flex gap-1" role="radiogroup" aria-label={label}>
              {[1, 2, 3, 4, 5].map((value) => {
                const active = value <= ratings[name];
                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={ratings[name] === value}
                    onClick={() =>
                      setRatings((current) => ({ ...current, [name]: value }))
                    }
                    className={
                      "grid h-9 w-9 place-items-center rounded-lg border text-base transition " +
                      (active
                        ? "border-acid/40 bg-acid/[0.08] text-acid"
                        : "border-zinc-800 text-zinc-700 hover:text-zinc-400")
                    }
                    aria-label={value + " out of 5"}
                  >
                    ★
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <label className="block">
        <span className="label">Public comment</span>
        <textarea
          className="field min-h-28 resize-y"
          name="comment"
          maxLength={2000}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="What should other creators know about this studio?"
        />
        <span className="mt-1 block text-right text-[9px] text-zinc-600">
          {comment.length}/2000
        </span>
      </label>

      <div className="rounded-xl border border-zinc-900 bg-black/20 p-4 text-[10px] leading-5 text-zinc-600">
        This review will be marked as verified because it is linked to your completed 36 booking.
        The studio can publish one response, but cannot change your rating.
      </div>

      <SubmitButton />
    </form>
  );
}
