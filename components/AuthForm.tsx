"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "signup";

export function AuthForm({ mode, nextTo }: { mode: Mode; nextTo?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);

    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    if (nextTo) payload.nextTo = nextTo;

    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      setError(data.error || "Something went wrong.");
      return;
    }

    router.replace(data.redirectTo || "/dashboard");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {mode === "signup" && (
        <>
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              Full name
            </span>
            <input
              name="name"
              required
              maxLength={100}
              autoComplete="name"
              className="field"
              placeholder="Your name"
            />
          </label>

          <fieldset>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
              I am joining as
            </legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="role-card">
                <input
                  className="peer sr-only"
                  type="radio"
                  name="role"
                  value="CREATOR"
                  defaultChecked
                />
                <span className="block text-sm font-black peer-checked:text-acid">
                  Creator
                </span>
                <span className="mt-1 block text-xs leading-5 text-zinc-500">
                  Find and book creative spaces.
                </span>
              </label>
              <label className="role-card">
                <input
                  className="peer sr-only"
                  type="radio"
                  name="role"
                  value="STUDIO_OWNER"
                />
                <span className="block text-sm font-black peer-checked:text-acid">
                  Studio owner
                </span>
                <span className="mt-1 block text-xs leading-5 text-zinc-500">
                  List and manage spaces.
                </span>
              </label>
            </div>
          </fieldset>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Referral code <span className="normal-case tracking-normal text-zinc-700">(optional)</span></span>
            <input name="referralCode" maxLength={32} className="field" placeholder="e.g. 36-AB12CD34" />
          </label>
        </>
      )}

      <label className="block">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Email
        </span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="field"
          placeholder="you@example.com"
        />
      </label>

      <label className="block">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
          Password
        </span>
        <input
          name="password"
          type="password"
          required
          minLength={10}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className="field"
          placeholder="10+ characters"
        />
      </label>

      {mode === "login" && <div className="-mt-2 text-right"><a className="text-xs text-zinc-500 hover:text-acid" href="/auth/forgot-password">Forgot password?</a></div>}

      {error && (
        <div role="alert" className="rounded-xl border border-red-900/60 bg-red-950/30 p-3 text-sm text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-xl bg-acid px-5 py-3.5 text-sm font-black text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy
          ? "Please wait…"
          : mode === "signup"
            ? "Create account"
            : "Log in"}
      </button>

      {mode === "signup" && (
        <p className="text-xs leading-5 text-zinc-600">
          Admin accounts cannot be created publicly. They are bootstrapped securely from the server.
        </p>
      )}
    </form>
  );
}
