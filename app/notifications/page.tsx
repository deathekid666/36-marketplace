import Link from "next/link";

import { AppHeader } from "@/components/AppHeader";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  openNotificationAction,
} from "@/app/notifications/actions";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

type View = "all" | "unread" | "bookings" | "messages" | "money";

function viewMatches(type: string, view: View) {
  const value = type.toUpperCase();
  if (view === "all") return true;
  if (view === "unread") return true;
  if (view === "messages") return value.includes("MESSAGE");
  if (view === "money") {
    return ["PAYMENT", "PAYOUT", "REFUND", "OFFLINE"].some((token) =>
      value.includes(token),
    );
  }
  return ["BOOKING", "SESSION", "REVIEW"].some((token) => value.includes(token));
}

function deliveryLabel(channel: string, status: string) {
  if (channel === "IN_APP") return null;
  return channel.replaceAll("_", " ") + " · " + status;
}

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireUser();
  const query = await searchParams;
  const view: View = ["unread", "bookings", "messages", "money"].includes(
    String(query.view || ""),
  )
    ? (query.view as View)
    : "all";

  const items = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 150,
    include: {
      deliveries: {
        orderBy: { createdAt: "asc" },
        select: { id: true, channel: true, status: true },
      },
    },
  });

  const unread = items.filter((item) => !item.readAt).length;
  const visible = items.filter(
    (item) =>
      (view !== "unread" || !item.readAt) &&
      viewMatches(item.type, view),
  );

  const tabs: Array<[View, string]> = [
    ["all", "All"],
    ["unread", "Unread"],
    ["bookings", "Bookings"],
    ["messages", "Messages"],
    ["money", "Payments"],
  ];

  return (
    <main className="min-h-screen bg-[#f7f7f7] text-[#222]">
      <AppHeader user={user} />
      <section className="mx-auto max-w-4xl px-5 py-10 sm:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-acid">
              Activity
            </span>
            <h1 className="mt-3 text-4xl font-black tracking-[-0.045em]">
              Notifications
            </h1>
            <p className="mt-2 text-sm text-[#717171]">
              {unread ? unread + " unread update" + (unread === 1 ? "" : "s") : "You are all caught up."}
            </p>
          </div>

          {unread > 0 && (
            <form action={markAllNotificationsReadAction}>
              <button className="rounded-full border border-[#d8d8d8] bg-white px-4 py-2 text-xs font-black">
                Mark all read
              </button>
            </form>
          )}
        </div>

        <nav className="mt-7 flex gap-2 overflow-x-auto pb-2">
          {tabs.map(([value, label]) => (
            <Link
              key={value}
              href={value === "all" ? "/notifications" : "/notifications?view=" + value}
              className={
                "shrink-0 rounded-full border px-4 py-2 text-xs font-black " +
                (view === value
                  ? "border-[#222] bg-[#222] text-white"
                  : "border-[#dddddd] bg-white text-[#717171]")
              }
            >
              {label}
              {value === "unread" && unread > 0 ? " · " + unread : ""}
            </Link>
          ))}
        </nav>

        <div className="mt-5 space-y-3">
          {visible.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-[#d8d8d8] bg-white p-10 text-center">
              <b className="text-lg">Nothing here</b>
              <p className="mt-2 text-sm text-[#8a8a8a]">
                No notifications match this view.
              </p>
            </div>
          ) : (
            visible.map((item) => {
              const externalDeliveries = item.deliveries
                .map((delivery) => deliveryLabel(delivery.channel, delivery.status))
                .filter(Boolean);

              return (
                <article
                  key={item.id}
                  className={
                    "rounded-2xl border bg-white p-5 transition " +
                    (item.readAt
                      ? "border-[#ebebeb]"
                      : "border-acid/40 shadow-[0_6px_20px_rgba(0,0,0,.04)]")
                  }
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {!item.readAt && <span className="h-2 w-2 rounded-full bg-acid" />}
                        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8a8a8a]">
                          {item.type.replaceAll("_", " ")}
                        </span>
                      </div>
                      <h2 className="mt-2 font-black">{item.title}</h2>
                      {item.body && (
                        <p className="mt-2 text-sm leading-6 text-[#717171]">
                          {item.body}
                        </p>
                      )}

                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <span className="text-[10px] text-[#a3a3a3]">
                          {new Intl.DateTimeFormat("en", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(item.createdAt)}
                        </span>
                        {externalDeliveries.map((delivery) => (
                          <span
                            key={String(delivery)}
                            className="rounded-full bg-[#f3f3f3] px-2 py-1 text-[9px] font-bold text-[#8a8a8a]"
                          >
                            {delivery}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {item.href && (
                        <form action={openNotificationAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="href" value={item.href} />
                          <button className="rounded-full bg-[#222] px-3 py-2 text-[10px] font-black text-white">
                            Open →
                          </button>
                        </form>
                      )}
                      {!item.readAt && (
                        <form action={markNotificationReadAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <button className="text-[10px] text-[#8a8a8a] hover:text-[#222222]">
                            Mark read
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}
