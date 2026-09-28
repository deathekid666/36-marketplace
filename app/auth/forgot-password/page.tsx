import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { ForgotPasswordForm } from "@/components/ForgotPasswordForm";
export const metadata={title:"Forgot password"};
export default function Page(){return <main className="min-h-screen"><AppHeader/><section className="mx-auto max-w-md px-5 py-20"><div className="panel"><span className="text-xs font-bold uppercase tracking-[.18em] text-acid">Account recovery</span><h1 className="mt-3 mb-7 text-3xl font-black">Reset your password</h1><ForgotPasswordForm/><Link className="mt-6 block text-center text-xs text-zinc-500 hover:text-white" href="/auth/login">Back to login</Link></div></section></main>}
