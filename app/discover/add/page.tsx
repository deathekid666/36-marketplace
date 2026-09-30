import { DiscoveryStudioCategory } from "@prisma/client";
import Link from "next/link";

import { submitMissingStudioAction } from "@/app/discover/add/actions";
import { AppHeader } from "@/components/AppHeader";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Suggest a missing studio · 36" };

const ERRORS: Record<string, string> = {
  name: "Enter the studio name.",
  phone: "Enter a usable public business phone number.",
  country: "Use a two-letter country code such as MA, FR, US or GB.",
  city: "Enter the studio city.",
  category: "Choose a studio type.",
  email: "Enter a valid public business email or leave it empty.",
  url: "Website and Instagram fields must be valid public http or https URLs.",
  "rate-limited": "You can submit up to five missing studios per day.",
  failed: "The studio could not be submitted.",
};

function labelCategory(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function AddMissingStudioPage({
  searchParams,
}: {
  searchParams: Promise<{
    submitted?: string;
    outcome?: string;
    error?: string;
  }>;
}) {
  const user = await requireUser();
  const query = await searchParams;

  return (
    <main className="min-h-screen">
      <AppHeader user={user} />

      <section className="mx-auto max-w-4xl px-5 py-12">
        <Link
          href="/discover"
          className="text-xs font-bold text-zinc-500 hover:text-white"
        >
          ← Global directory
        </Link>

        <div className="mt-7 max-w-3xl">
          <span className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">
            Coverage contribution
          </span>
          <h1 className="mt-3 text-4xl font-black tracking-[-0.045em] sm:text-5xl">
            Suggest a missing studio
          </h1>
          <p className="mt-4 text-sm leading-7 text-zinc-500">
            Add a real creative studio that is missing from the directory. 36 will
            deduplicate and review the submission before it can appear publicly.
            A suggestion never creates rooms, pricing, availability or booking.
          </p>
        </div>

        {query.submitted === "1" && (
          <div className="mt-7 rounded-xl border border-emerald-900/50 bg-emerald-950/10 p-4 text-sm text-emerald-300">
            Suggestion received. It was sent through duplicate detection and the
            discovery review pipeline.
          </div>
        )}

        {query.error && ERRORS[query.error] && (
          <div className="mt-7 rounded-xl border border-red-900/50 bg-red-950/10 p-4 text-sm text-red-300">
            {ERRORS[query.error]}
          </div>
        )}

        <form
          action={submitMissingStudioAction}
          className="mt-8 space-y-5 rounded-3xl border border-zinc-800 bg-[#11120f] p-6"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="label">Studio name</span>
              <input
                name="name"
                required
                maxLength={180}
                className="field"
                placeholder="Example Recording Studio"
              />
            </label>

            <label>
              <span className="label">Studio type</span>
              <select name="category" required className="field" defaultValue="">
                <option value="" disabled>
                  Choose type
                </option>
                {Object.values(DiscoveryStudioCategory)
                  .filter((value) => value !== "OTHER")
                  .map((value) => (
                    <option key={value} value={value}>
                      {labelCategory(value)}
                    </option>
                  ))}
              </select>
            </label>

            <label>
              <span className="label">Public business phone</span>
              <input
                name="phone"
                required
                maxLength={80}
                className="field"
                placeholder="+212..."
              />
            </label>

            <label>
              <span className="label">Country code</span>
              <input
                name="countryCode"
                required
                minLength={2}
                maxLength={2}
                className="field uppercase"
                placeholder="MA"
              />
            </label>

            <label>
              <span className="label">City</span>
              <input
                name="city"
                required
                maxLength={160}
                className="field"
                placeholder="Casablanca"
              />
            </label>

            <label>
              <span className="label">Region / state</span>
              <input name="region" maxLength={160} className="field" />
            </label>

            <label>
              <span className="label">District / neighborhood</span>
              <input name="district" maxLength={160} className="field" />
            </label>

            <label>
              <span className="label">Postal code</span>
              <input name="postalCode" maxLength={40} className="field" />
            </label>

            <label>
              <span className="label">Public business email</span>
              <input name="email" type="email" maxLength={320} className="field" />
            </label>

            <label>
              <span className="label">Website</span>
              <input
                name="website"
                type="url"
                maxLength={500}
                className="field"
                placeholder="https://..."
              />
            </label>

            <label>
              <span className="label">Instagram URL</span>
              <input
                name="instagram"
                type="url"
                maxLength={500}
                className="field"
                placeholder="https://instagram.com/..."
              />
            </label>

            <label className="sm:col-span-2">
              <span className="label">Address</span>
              <textarea
                name="address"
                maxLength={500}
                className="field min-h-24"
                placeholder="Public studio address"
              />
            </label>
          </div>

          <div className="rounded-xl border border-amber-900/40 bg-amber-950/10 p-4 text-xs leading-5 text-zinc-500">
            Submissions are treated as directory leads. They are not automatically
            published, owner-verified or bookable. If this is your studio, you can
            claim the reviewed listing afterward.
          </div>

          <button className="w-full rounded-xl bg-sky-300 px-5 py-4 text-sm font-black text-black">
            Submit studio for review
          </button>
        </form>
      </section>
    </main>
  );
}
