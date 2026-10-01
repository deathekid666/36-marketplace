import Link from "next/link";
import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import { AuthForm } from "@/components/AuthForm";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Log in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getCurrentUser();
  const query = await searchParams;
  const nextTo = query.next && query.next.startsWith("/") && !query.next.startsWith("//") ? query.next : undefined;
  if (user) redirect(nextTo || "/dashboard");

  return (
    <main className="min-h-screen bg-[#f7f7f7] text-[#222]">
      <AppHeader />
      <section className="air-auth-page">
        <div className="air-auth-card">
          <div className="air-auth-card-head">
            <span>Welcome back</span>
            <h1>Log in to 36</h1>
            <p>Continue to your studios, bookings and messages.</p>
          </div>
          <AuthForm mode="login" nextTo={nextTo} />
          <p className="air-auth-switch">
            New here? <Link href="/auth/signup">Create an account</Link>
          </p>
        </div>
      </section>
    </main>
  );
}
