"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

type Mode = "login" | "signup";

export function AuthForm({
  mode,
  nextTo,
  defaultRole = "CREATOR",
}: {
  mode: Mode;
  nextTo?: string;
  defaultRole?: "CREATOR" | "STUDIO_OWNER";
}) {
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
    <form onSubmit={submit} className="air-auth-form">
      {mode === "signup" && (
        <>
          <label>
            <span>Full name</span>
            <input name="name" required maxLength={100} autoComplete="name" className="field" placeholder="Your name" />
          </label>

          <fieldset>
            <legend>I am joining as</legend>
            <div className="air-role-grid">
              <label className="role-card">
                <input className="peer sr-only" type="radio" name="role" value="CREATOR" defaultChecked={defaultRole === "CREATOR"} />
                <b>Creator</b>
                <small>Find and book creative spaces.</small>
              </label>
              <label className="role-card">
                <input className="peer sr-only" type="radio" name="role" value="STUDIO_OWNER" defaultChecked={defaultRole === "STUDIO_OWNER"} />
                <b>Studio owner</b>
                <small>List and manage spaces.</small>
              </label>
            </div>
          </fieldset>

          <label>
            <span>Referral code <small>(optional)</small></span>
            <input name="referralCode" maxLength={32} className="field" placeholder="e.g. 36-AB12CD34" />
          </label>
        </>
      )}

      <label>
        <span>Email</span>
        <input name="email" type="email" required autoComplete="email" className="field" placeholder="you@example.com" />
      </label>

      <label>
        <span>Password</span>
        <input name="password" type="password" required minLength={10} autoComplete={mode === "signup" ? "new-password" : "current-password"} className="field" placeholder="10+ characters" />
      </label>

      {mode === "login" && (
        <div className="air-forgot"><a href="/auth/forgot-password">Forgot password?</a></div>
      )}

      {error && <div role="alert" className="air-auth-error">{error}</div>}

      <button type="submit" disabled={busy} className="air-auth-submit">
        {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
      </button>
    </form>
  );
}
