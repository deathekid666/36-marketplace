"use client";

import { useActionState } from "react";

import {
  runMarketplaceLifecycleQaAction,
  type MarketplaceQaState,
} from "@/app/admin/test-marketplace/actions";

const initialState: MarketplaceQaState = {
  ok: false,
  message: "",
  checks: [],
};

export function MarketplaceLifecycleQa({
  enabled,
}: {
  enabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    runMarketplaceLifecycleQaAction,
    initialState,
  );

  return (
    <div>
      <form action={action}>
        <button
          disabled={pending || !enabled}
          className="w-full rounded-xl border border-acid/35 bg-acid/[0.06] px-5 py-4 text-sm font-black text-acid disabled:cursor-not-allowed disabled:opacity-40"
        >
          {pending
            ? "Running lifecycle QA…"
            : enabled
              ? "Run automated marketplace QA"
              : "Create the demo environment first"}
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

      {state.checks && state.checks.length > 0 && (
        <div className="mt-4 space-y-2">
          {state.checks.map((check) => (
            <div
              key={check.name}
              className="flex items-start gap-3 rounded-xl border border-zinc-900 bg-black/20 p-3"
            >
              <span
                className={
                  "grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-black " +
                  (check.ok
                    ? "bg-emerald-400/10 text-emerald-300"
                    : "bg-red-400/10 text-red-300")
                }
              >
                {check.ok ? "✓" : "!"}
              </span>
              <div>
                <b className="text-xs">{check.name}</b>
                <p className="mt-1 text-[10px] leading-5 text-zinc-600">
                  {check.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
