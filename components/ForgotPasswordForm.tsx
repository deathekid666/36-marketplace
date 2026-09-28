"use client";
import { FormEvent, useState } from "react";
export function ForgotPasswordForm() {
  const [done,setDone]=useState(false); const [busy,setBusy]=useState(false);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);const data=new FormData(e.currentTarget);await fetch("/api/auth/forgot-password",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:data.get("email")})});setBusy(false);setDone(true)}
  if(done)return <p className="rounded-xl border border-acid/20 bg-acid/[.04] p-4 text-sm text-zinc-300">If an account exists for that email, a reset link has been sent.</p>;
  return <form onSubmit={submit} className="space-y-4"><label><span className="label">Email</span><input className="field" name="email" type="email" required autoComplete="email"/></label><button disabled={busy} className="w-full rounded-xl bg-acid px-5 py-3 text-sm font-black text-black">{busy?"Sending…":"Send reset link"}</button></form>;
}
