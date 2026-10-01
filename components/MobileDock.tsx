import Link from "next/link";
import type { UserRole } from "@prisma/client";

const creator = [
  ["Studios", "/studios"],
  ["Messages", "/messages"],
  ["Bookings", "/creator/bookings"],
  ["Alerts", "/notifications"],
];

const owner = [
  ["Home", "/owner"],
  ["Messages", "/messages"],
  ["Bookings", "/owner/bookings"],
  ["Revenue", "/owner/revenue"],
];

const admin = [
  ["Admin", "/admin"],
  ["Analytics", "/admin/analytics"],
  ["Payments", "/admin/payments"],
  ["Disputes", "/admin/disputes"],
];

export function MobileDock({ role }: { role: UserRole }) {
  const items =
    role === "CREATOR"
      ? creator
      : role === "STUDIO_OWNER"
        ? owner
        : admin;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-4 border-t border-zinc-800 bg-black/95 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur sm:hidden">
      {items.map(([label, href]) => (
        <Link
          key={href}
          href={href}
          className="rounded-lg px-2 py-2 text-center text-[10px] font-bold text-zinc-400 hover:bg-zinc-900 hover:text-acid"
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
