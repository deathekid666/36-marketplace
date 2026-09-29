import { AppHeader } from "@/components/AppHeader";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
export const metadata={title:"Reset password"};
export default async function Page({searchParams}:{searchParams:Promise<{token?:string}>}){const q=await searchParams;return <main className="min-h-screen"><AppHeader/><section className="mx-auto max-w-md px-5 py-20"><div className="panel"><span className="text-xs font-bold uppercase tracking-[.18em] text-acid">Account recovery</span><h1 className="mt-3 mb-7 text-3xl font-black">Choose a new password</h1>{q.token?<ResetPasswordForm token={q.token}/>:<p className="text-sm text-red-300">Missing reset token.</p>}</div></section></main>}
