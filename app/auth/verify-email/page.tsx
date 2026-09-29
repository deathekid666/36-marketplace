import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { VerifyEmailPanel } from "@/components/VerifyEmailPanel";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Verify email" };
export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login");
  if (user.emailVerifiedAt) redirect("/dashboard");
  const query = await searchParams;
  return <main className="min-h-screen"><AppHeader user={user}/><section className="mx-auto max-w-xl px-5 py-20"><div className="panel"><span className="text-xs font-bold uppercase tracking-[.18em] text-acid">Account security</span><h1 className="mt-3 text-4xl font-black tracking-[-.04em]">Verify your email</h1><p className="mt-5 text-sm leading-7 text-zinc-400">We sent a verification link to <b className="text-white">{user.email}</b>. Verification is required before booking or submitting a studio to the marketplace.</p>{query.error === "token" && <p className="mt-4 rounded-xl border border-red-900/50 bg-red-950/20 p-3 text-sm text-red-300">That verification link is invalid or expired.</p>}<VerifyEmailPanel/></div></section></main>;
}
