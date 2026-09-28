"use client";

import { useState } from "react";

export function VerifyEmailPanel() {
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  async function resend() {
    setBusy(true); setStatus("");
    const res = await fetch("/api/auth/resend-verification", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setStatus(res.ok ? "Verification email sent. Check your inbox." : (data.error || "Could not send email."));
  }
  return <div className="mt-6"><button onClick={resend} disabled={busy} className="rounded-full bg-acid px-5 py-3 text-sm font-black text-black disabled:opacity-50">{busy ? "Sending…" : "Resend verification email"}</button>{status && <p className="mt-3 text-xs text-zinc-500">{status}</p>}</div>;
}
