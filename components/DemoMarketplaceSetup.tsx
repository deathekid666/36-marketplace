"use client";

import { useActionState } from "react";

import {
  setupDemoMarketplaceAction,
  type DemoSetupState,
} from "@/app/admin/test-marketplace/actions";

const initialState: DemoSetupState = {
  ok: false,
  message: "",
};

function Credential({
  label,
  email,
  password,
}: {
  label: string;
  email: string;
  password: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-black/25 p-4">
      <span className="label">{label}</span>
      <div className="mt-2 space-y-1 font-mono text-xs">
        <p>{email}</p>
        <p className="break-all text-acid">{password}</p>
      </div>
    </div>
  );
}

export function DemoMarketplaceSetup() {
  const [state, action, pending] = useActionState(
    setupDemoMarketplaceAction,
    initialState,
  );

  return (
    <div>
      <form action={action}>
        <button
          disabled={pending}
          className="w-full rounded-xl bg-acid px-5 py-4 text-sm font-black text-black disabled:opacity-50"
        >
          {pending
            ? "Creating 3 demo studios…"
            : "Create / reset 3-studio demo"}
        </button>
      </form>

      {state.message && (
        <div
          className={
            "mt-4 rounded-xl border p-4 text-xs leading-5 " +
            (state.ok
              ? "border-emerald-900/40 bg-emerald-950/10 text-emerald-300"
              : "border-red-900/40 bg-red-950/10 text-red-300")
          }
        >
          {state.message}
        </div>
      )}

      {state.ok &&
        state.ownerEmail &&
        state.ownerPassword &&
        state.creatorEmail &&
        state.creatorPassword && (
          <div className="mt-5 space-y-3">
            <Credential
              label="Studio Owner login"
              email={state.ownerEmail}
              password={state.ownerPassword}
            />
            <Credential
              label="Creator login"
              email={state.creatorEmail}
              password={state.creatorPassword}
            />
            <p className="text-[10px] leading-5 text-amber-300">
              Copy these passwords now. Resetting the demo generates new
              passwords and invalidates these credentials.
            </p>

            {state.studioUrls && state.studioUrls.length > 0 && (
              <div className="rounded-2xl border border-zinc-900 bg-black/20 p-4">
                <span className="label">Demo listings</span>
                <div className="mt-3 space-y-2">
                  {state.studioUrls.map((studio) => (
                    <a
                      key={studio.url}
                      href={studio.url}
                      className="block text-xs font-black text-acid"
                    >
                      {studio.name} →
                    </a>
                  ))}
                </div>
              </div>
            )}

            {state.compareUrl && (
              <a
                href={state.compareUrl}
                className="inline-flex rounded-xl border border-acid/30 px-4 py-3 text-xs font-black text-acid"
              >
                Compare all 3 demo studios →
              </a>
            )}
          </div>
        )}
    </div>
  );
}
