import Link from "next/link";
import type { User } from "@prisma/client";

import { Logo } from "@/components/Logo";
import { LogoutButton } from "@/components/LogoutButton";
import { MobileDock } from "@/components/MobileDock";
import { db } from "@/lib/db";

function initials(name?: string | null) {
  return String(name || "36")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "36";
}

function Icon({ name }: { name: "search" | "bell" | "message" | "menu" }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
  if (name === "bell") return <svg {...common}><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>;
  if (name === "message") return <svg {...common}><path d="M21 12a8 8 0 0 1-8 8H6l-3 2v-7a8 8 0 1 1 18-3Z" /></svg>;
  return <svg {...common}><path d="M5 7h14M5 12h14M5 17h14" /></svg>;
}

export async function AppHeader({ user }: { user?: User | null }) {
  const unread = user
    ? await db.notification.count({ where: { userId: user.id, readAt: null } }).catch(() => 0)
    : 0;

  return (
    <>
      <header className="air-header">
        <div className="air-header-inner">
          <Logo />

          <nav className="air-header-nav" aria-label="Main navigation">
            <Link href="/studios">Studios</Link>
            <Link href="/now">36 NOW</Link>
            <Link href="/discover">Discover</Link>
          </nav>

          <div className="air-header-actions">
            {user?.role === "STUDIO_OWNER" ? (
              <Link href="/owner/studios/new" className="air-host-link">
                List your studio
              </Link>
            ) : user?.role === "CREATOR" ? (
              <Link href="/list-your-studio" className="air-host-link">
                List your studio
              </Link>
            ) : !user ? (
              <Link href="/list-your-studio" className="air-host-link">
                List your studio
              </Link>
            ) : null}

            {user ? (
              <>
                {(user.role === "CREATOR" || user.role === "STUDIO_OWNER") && (
                  <Link href="/messages" className="air-icon-button" aria-label="Messages">
                    <Icon name="message" />
                  </Link>
                )}
                <Link href="/notifications" className="air-icon-button air-notification" aria-label="Notifications">
                  <Icon name="bell" />
                  {unread > 0 && (
                    <span>{unread > 99 ? "99+" : unread}</span>
                  )}
                </Link>
                <Link href="/profile" className="air-profile-menu" aria-label="Profile">
                  <Icon name="menu" />
                  <span className="air-header-avatar">{initials(user.name)}</span>
                </Link>
                <Link
                  href={
                    user.role === "ADMIN"
                      ? "/admin"
                      : user.role === "STUDIO_OWNER"
                        ? "/owner"
                        : "/creator"
                  }
                  className="air-dashboard-link"
                >
                  Dashboard
                </Link>
                <LogoutButton />
              </>
            ) : (
              <>
                <Link href="/auth/login" className="air-login-link">Log in</Link>
                <Link href="/auth/signup" className="air-signup-link">Sign up</Link>
              </>
            )}
          </div>
        </div>
      </header>
      {user && <MobileDock role={user.role} />}
    </>
  );
}
