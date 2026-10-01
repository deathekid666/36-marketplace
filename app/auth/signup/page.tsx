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
    <main className="min-h-screen bg-[#f7f7f7] text-[#222]">
      <AppHeader />
      <section className="air-auth-page">
        <div className="air-auth-card air-auth-card-wide">
          <div className="air-auth-card-head">
            <span>Join 36</span>
            <h1>Create your account</h1>
            <p>Book creative spaces or list your own studio.</p>
          </div>
          <AuthForm mode="signup" />
          <p className="air-auth-switch">
            Already registered? <Link href="/auth/login">Log in</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
