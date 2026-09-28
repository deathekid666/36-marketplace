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
    <main className="min-h-screen">
      <AppHeader />
      <section className="mx-auto max-w-md px-5 py-20">
        <div className="panel">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-acid">
            Welcome back
          </span>
          <h1 className="mb-8 mt-3 text-3xl font-black">Log in to 36</h1>
          <AuthForm mode="login" nextTo={nextTo} />
          <p className="mt-6 text-center text-xs text-zinc-600">
            New here?{" "}
            <Link className="font-bold text-zinc-300 hover:text-acid" href="/auth/signup">
              Create an account
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
