import { redirect } from "next/navigation";

import { AppHeader } from "@/components/AppHeader";
import {
  MessagingInbox,
  type InboxMessage,
  type InboxThread,
} from "@/components/MessagingInbox";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { studioTimeZone } from "@/lib/time";

export const metadata = {
  title: "Messages · 36",
};

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ booking?: string }>;
}) {
  const user = await requireUser();
  if (!["CREATOR", "STUDIO_OWNER"].includes(user.role)) {
    redirect("/dashboard");
  }

  const query = await searchParams;

  const bookings = await db.booking.findMany({
    where:
      user.role === "CREATOR"
        ? { creatorId: user.id }
        : { studio: { ownerId: user.id } },
    include: {
      creator: {
        select: {
          id: true,
          name: true,
        },
      },
      studio: {
        include: {
          owner: {
            select: {
              id: true,
              name: true,
            },
          },
          photos: {
            orderBy: { sortOrder: "asc" },
            take: 1,
          },
        },
      },
      room: true,
      conversation: {
        include: {
          messages: {
            include: {
              sender: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 120,
  });

  const threads: InboxThread[] = bookings
    .map((booking) => {
      const last = booking.conversation?.messages[0] || null;
      return {
        bookingId: booking.id,
        counterpartName:
          user.role === "CREATOR"
            ? booking.studio.owner.name
            : booking.creator.name,
        studioName: booking.studio.name,
        studioSlug: booking.studio.slug,
        roomName: booking.room.name,
        startAt: booking.startAt.toISOString(),
        endAt: booking.endAt.toISOString(),
        status: booking.status,
        totalAmountMad: booking.totalAmountMad,
        currency: booking.currency,
        timeZone: studioTimeZone(booking.studio),
        photoUrl: booking.studio.photos[0]?.url || null,
        lastMessage: last?.body || "",
        lastMessageAt: last?.createdAt.toISOString() || null,
        needsReply: Boolean(last && last.senderId !== user.id),
      };
    })
    .sort((a, b) => {
      const aTime = a.lastMessageAt
        ? new Date(a.lastMessageAt).getTime()
        : new Date(a.startAt).getTime();
      const bTime = b.lastMessageAt
        ? new Date(b.lastMessageAt).getTime()
        : new Date(b.startAt).getTime();
      return bTime - aTime;
    });

  const requested =
    query.booking &&
    threads.some((thread) => thread.bookingId === query.booking)
      ? query.booking
      : null;

  const initialBookingId = requested || threads[0]?.bookingId || null;

  let initialMessages: InboxMessage[] = [];
  if (initialBookingId) {
    const conversation = await db.conversation.findUnique({
      where: { bookingId: initialBookingId },
      include: {
        messages: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: "asc" },
          take: 200,
        },
      },
    });

    initialMessages =
      conversation?.messages.map((message) => ({
        id: message.id,
        senderId: message.senderId,
        senderName: message.sender.name,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      })) || [];
  }

  return (
    <main className="min-h-screen bg-white text-[#222]">
      <AppHeader user={user} />

      <section className="mx-auto max-w-[1450px] px-3 py-4 sm:px-5 sm:py-8">
        {threads.length === 0 ? (
          <div className="mx-auto max-w-xl rounded-[2rem] border border-[#dddddd] bg-white p-10 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#f3f3f3] text-2xl">
              💬
            </div>
            <h1 className="mt-5 text-3xl font-black">No messages yet</h1>
            <p className="mt-3 text-sm leading-6 text-[#8a8a8a]">
              Your booking conversations will appear here.
            </p>
          </div>
        ) : (
          <MessagingInbox
            userId={user.id}
            role={user.role as "CREATOR" | "STUDIO_OWNER"}
            threads={threads}
            initialBookingId={initialBookingId}
            initialMessages={initialMessages}
          />
        )}
      </section>
    </main>
  );
}
