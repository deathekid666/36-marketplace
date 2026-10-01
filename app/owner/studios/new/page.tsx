import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { requireRole } from "@/lib/auth";
import { STUDIO_CATEGORIES } from "@/lib/studio";
import { createStudioAction } from "@/app/owner/actions";

export default async function NewStudioPage() {
  const user = await requireRole("STUDIO_OWNER");
  return (
    <main className="min-h-screen">
      <AppHeader user={user} />
      <section className="mx-auto max-w-3xl px-5 py-12">
        <Link href="/owner/studios" className="text-xs font-bold text-zinc-500 hover:text-white">← My studios</Link>
        <span className="mt-9 block text-xs font-bold uppercase tracking-[0.2em] text-acid">Step 1</span>
        <h1 className="mt-3 text-4xl font-black tracking-[-0.045em]">Create your studio listing</h1>
        <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-500">Start with the identity. Rooms, equipment, photos and availability come next.</p>

        <form action={createStudioAction} className="panel mt-8 space-y-5">
          <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Studio name</span><input className="field" name="name" required minLength={3} maxLength={120} placeholder="e.g. Atlas Sound Lab" /></label>
          <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Primary category</span><select className="field" name="primaryCategory">{STUDIO_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">City</span><input className="field" name="city" defaultValue="Casablanca" required /></label>
            <label className="block"><span className="mb-2 block text-xs font-bold uppercase tracking-[0.12em] text-zinc-500">Neighborhood</span><input className="field" name="neighborhood" placeholder="Maarif, Gauthier…" /></label>
          </div>
          <button className="w-full rounded-xl bg-acid px-5 py-3.5 text-sm font-black text-black">Create listing →</button>
        </form>
      </section>
    </main>
  );
}
