import Link from "next/link";
import type { User } from "@prisma/client";
import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { MobileDock } from "@/components/MobileDock";
import { db } from "@/lib/db";

export async function AppHeader({ user }: { user?: User | null }) {
  const unread = user ? await db.notification.count({ where: { userId: user.id, readAt: null } }).catch(() => 0) : 0;
  return (<>
    <header className="border-b border-zinc-900 bg-ink/95">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
        <Logo />
        <nav className="flex flex-wrap items-center justify-end gap-3">
          <Link href="/studios" className="text-xs font-semibold text-zinc-400 hover:text-white">Studios</Link>
          <Link href="/discover" className="hidden text-xs font-semibold text-zinc-400 hover:text-white md:inline">Discover</Link>
          <Link href="/now" className="text-xs font-semibold text-acid hover:text-white">⚡ 36 NOW</Link>
          {user ? (
            <>
              {!user.emailVerifiedAt && <Link href="/auth/verify-email" className="rounded-full border border-amber-700/50 bg-amber-950/20 px-3 py-1.5 text-[10px] font-black text-amber-300">Verify email</Link>}
              {user.role === "CREATOR" && <Link href="/creator/favorites" className="hidden text-xs font-semibold text-zinc-400 hover:text-white sm:inline">♥ Favorites</Link>}
              {user.role === "CREATOR" && <Link href="/creator/referrals" className="hidden text-xs font-semibold text-zinc-400 hover:text-white lg:inline">Referrals</Link>}
              {user.role === "CREATOR" && <Link href="/creator/requests" className="hidden text-xs font-semibold text-zinc-400 hover:text-white sm:inline">36 Request</Link>}
              {user.role === "STUDIO_OWNER" && <Link href="/owner/now" className="hidden text-xs font-semibold text-zinc-400 hover:text-white sm:inline">Sell empty time</Link>}
              {(user.role === "CREATOR" || user.role === "STUDIO_OWNER") && <Link href="/messages" className="text-xs font-semibold text-zinc-400 hover:text-white">Messages</Link>}
              <Link href="/notifications" className="relative text-xs font-semibold text-zinc-400 hover:text-white">Notifications{unread > 0 && <span className="ml-1 inline-flex min-w-5 justify-center rounded-full bg-acid px-1.5 py-0.5 text-[9px] font-black text-black">{unread > 99 ? "99+" : unread}</span>}</Link>
              <Link href="/profile" className="text-xs font-semibold text-zinc-400 hover:text-white">Profile</Link>
              <Link href="/dashboard" className="text-xs font-semibold text-zinc-400 hover:text-white">Dashboard</Link>
              <LogoutButton />
            </>
          ) : (
            <>
              <Link href="/auth/login" className="text-xs font-semibold text-zinc-300 hover:text-white">Log in</Link>
              <Link href="/auth/signup" className="rounded-full bg-acid px-4 py-2 text-xs font-black text-black">Join 36</Link>
            </>
          )}
        </nav>
      </div>
    </header>
    {user && <MobileDock role={user.role} />}
  </>);

}
