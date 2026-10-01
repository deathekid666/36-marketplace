"use client";

import { useActionState } from "react";

import {
  bootstrapAdminAction,
  type AdminBootstrapState,
} from "@/app/admin/bootstrap/actions";

const initialState: AdminBootstrapState = {
  ok: false,
  message: "",
};

export function AdminBootstrapForm() {
  const [state, action, pending] = useActionState(
    bootstrapAdminAction,
    initialState,
  );

  return (
    <form action={action} className="mt-8 space-y-4">
      <label>
        <span className="label">One-time bootstrap token</span>
        <input
          className="field font-mono"
          name="token"
          type="password"
          autoComplete="off"
          required
          placeholder="Paste the token from ChatGPT"
        />
      </label>

      <label>
        <span className="label">Admin name</span>
        <input
          className="field"
          name="name"
          required
          minLength={2}
          maxLength={100}
          placeholder="Your name"
        />
      </label>

      <label>
        <span className="label">Admin email</span>
        <input
          className="field"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </label>

      <label>
        <span className="label">New admin password</span>
        <input
          className="field"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </label>

      <label>
        <span className="label">Confirm password</span>
        <input
          className="field"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
        />
      </label>

      {state.message && (
        <div
          role="alert"
          className="rounded-xl border border-red-900/40 bg-red-950/15 p-4 text-xs leading-5 text-red-300"
        >
          {state.message}
        </div>
      )}

      <button
        disabled={pending}
        className="w-full rounded-xl bg-acid px-5 py-4 text-sm font-black text-black disabled:opacity-50"
      >
        {pending
          ? "Creating admin…"
          : "Create / reset Admin account"}
      </button>
    </form>
  );
}
