import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Create account" };

export default async function SignupPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    <main className="min-h-screen">
      <AppHeader />
      <section className="mx-auto grid max-w-5xl gap-12 px-5 py-16 lg:grid-cols-[1fr_460px] lg:py-24">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-acid">
            Join 36
          </span>
          <h1 className="mt-4 text-5xl font-black tracking-[-0.055em]">
            One marketplace.
            <br />
            Two sides.
          </h1>
          <p className="mt-6 max-w-md text-sm leading-7 text-zinc-500">
            Creators find spaces. Studio owners publish inventory. Admin access
            stays private and server-controlled.
          </p>
        </div>
        <div className="panel">
          <h2 className="mb-7 text-2xl font-black">Create account</h2>
          <AuthForm mode="signup" />
          <p className="mt-6 text-center text-xs text-zinc-600">
            Already registered?{" "}
            <Link className="font-bold text-zinc-300 hover:text-acid" href="/auth/login">
              Log in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
