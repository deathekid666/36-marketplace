import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/notifications/actions";

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  const unread = items.filter((x)=>!x.readAt).length;
  return <main className="min-h-screen"><AppHeader user={user}/><section className="mx-auto max-w-4xl px-5 py-12"><div className="flex items-end justify-between gap-4"><div><span className="text-xs font-bold uppercase tracking-[0.2em] text-acid">Activity</span><h1 className="mt-3 text-4xl font-black tracking-[-0.045em]">Notifications</h1></div>{unread>0&&<form action={markAllNotificationsReadAction}><button className="text-xs font-bold text-zinc-500 hover:text-white">Mark all read</button></form>}</div><div className="mt-8 space-y-3">{items.length===0?<div className="rounded-2xl border border-dashed border-zinc-800 p-10 text-center text-sm text-zinc-600">Nothing here yet.</div>:items.map((item)=><article key={item.id} className={`rounded-2xl border p-5 ${item.readAt?"border-zinc-900 bg-zinc-950/40":"border-acid/30 bg-acid/[0.03]"}`}><div className="flex items-start justify-between gap-4"><div><span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-600">{item.type.replaceAll("_"," ")}</span><h2 className="mt-1 font-black">{item.title}</h2>{item.body&&<p className="mt-2 text-sm leading-6 text-zinc-500">{item.body}</p>}<span className="mt-3 block text-[10px] text-zinc-700">{new Intl.DateTimeFormat("en",{dateStyle:"medium",timeStyle:"short"}).format(item.createdAt)}</span></div><div className="flex flex-col items-end gap-2">{item.href&&<Link href={item.href} className="text-xs font-black text-acid">Open →</Link>}{!item.readAt&&<form action={markNotificationReadAction}><input type="hidden" name="id" value={item.id}/><button className="text-[10px] text-zinc-600 hover:text-white">Mark read</button></form>}</div></div></article>)}</div></section></main>;
}
