"use client";

import Link from "next/link";
import type { UserRole } from "@prisma/client";

const creator = [
  ["Explore", "/studios", "⌕"],
  ["Favorites", "/creator/favorites", "♡"],
  ["Messages", "/messages", "◌"],
  ["Profile", "/profile", "○"],
];

const owner = [
  ["Home", "/owner", "⌂"],
  ["Messages", "/messages", "◌"],
  ["Bookings", "/owner/bookings", "▣"],
  ["Profile", "/profile", "○"],
];

const admin = [
  ["Admin", "/admin", "⌂"],
  ["Analytics", "/admin/analytics", "⌁"],
  ["Payments", "/admin/payments", "◇"],
  ["Profile", "/profile", "○"],
];

export function MobileDock({ role }: { role: UserRole }) {
  const items = role === "CREATOR" ? creator : role === "STUDIO_OWNER" ? owner : admin;

  return (
    <nav className="air-mobile-dock">
      {items.map(([label, href, icon]) => (
        <Link key={href} href={href}>
          <span>{icon}</span>
          <b>{label}</b>
        </Link>
      ))}
    </nav>
  );
}
