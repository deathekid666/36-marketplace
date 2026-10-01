import type { Metadata } from "next";

import { AdminBootstrapForm } from "@/components/AdminBootstrapForm";

export const metadata: Metadata = {
  title: "Admin bootstrap · 36",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminBootstrapPage() {
  return (
    <main className="min-h-screen">
      <section className="mx-auto max-w-xl px-5 py-16 sm:py-24">
        <span className="text-xs font-black uppercase tracking-[0.18em] text-acid">
          One-time setup
        </span>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.045em]">
          Create your 36 Admin login
        </h1>
        <p className="mt-4 text-sm leading-7 text-zinc-500">
          This page accepts one single-use bootstrap token. Choose the email
          and password you want for the Admin account. The plaintext token and
          your password are never stored in GitHub.
        </p>

        <div className="mt-6 rounded-2xl border border-amber-900/35 bg-amber-950/10 p-4 text-xs leading-5 text-zinc-500">
          After a successful bootstrap, this token is permanently consumed.
          The account is email-verified, activated and signed in immediately.
        </div>

        <AdminBootstrapForm />
      </section>
    </main>
  );
}
