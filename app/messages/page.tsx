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
  searchParams: Promise<{ booking?: string; thread?: string }>;
}) {
  const user = await requireUser();
  if (!["CREATOR", "STUDIO_OWNER"].includes(user.role)) {
    redirect("/dashboard");
  }

  const query = await searchParams;

  const [bookings, inquiries] = await Promise.all([
    db.booking.findMany({
      where: {
        OR: [
          { creatorId: user.id },
          { studio: { ownerId: user.id } },
        ],
      },
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
    }),
    db.conversation.findMany({
      where: {
        bookingId: null,
        studioId: { not: null },
        OR: [
          { creatorId: user.id },
          {
            ownerId: user.id,
            studio: { ownerId: user.id },
          },
        ],
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
          },
        },
        owner: {
          select: {
            id: true,
            name: true,
          },
        },
        studio: {
          include: {
            photos: {
              orderBy: { sortOrder: "asc" },
              take: 1,
            },
          },
        },
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
      orderBy: { updatedAt: "desc" },
      take: 120,
    }),
  ]);

  const bookingThreads: InboxThread[] = bookings.map((booking) => {
    const last = booking.conversation?.messages[0] || null;
    return {
      id: "booking:" + booking.id,
      kind: "BOOKING",
      bookingId: booking.id,
      conversationId: booking.conversation?.id || null,
      messageEndpoint: "/api/messages/" + booking.id,
      counterpartName:
        booking.creatorId === user.id
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
      perspective:
        booking.creatorId === user.id ? "CREATOR" : "OWNER",
    };
  });

  const inquiryThreads: InboxThread[] = inquiries.flatMap((conversation) => {
    if (!conversation.studio || !conversation.creator || !conversation.owner) {
      return [];
    }

    const last = conversation.messages[0] || null;
    return [
      {
        id: "inquiry:" + conversation.id,
        kind: "INQUIRY" as const,
        bookingId: null,
        conversationId: conversation.id,
        messageEndpoint:
          "/api/messages/inquiry/" + conversation.id,
        counterpartName:
          conversation.creatorId === user.id
            ? conversation.owner.name
            : conversation.creator.name,
        studioName: conversation.studio.name,
        studioSlug: conversation.studio.slug,
        roomName: "Pre-booking inquiry",
        startAt: null,
        endAt: null,
        status: "INQUIRY",
        totalAmountMad: null,
        currency: conversation.studio.currency,
        timeZone: studioTimeZone(conversation.studio),
        photoUrl: conversation.studio.photos[0]?.url || null,
        lastMessage: last?.body || "",
        lastMessageAt:
          last?.createdAt.toISOString() ||
          conversation.createdAt.toISOString(),
        needsReply: Boolean(last && last.senderId !== user.id),
        perspective:
          conversation.creatorId === user.id ? "CREATOR" : "OWNER",
      },
    ];
  });

  const threads = [...bookingThreads, ...inquiryThreads].sort((a, b) => {
    const aValue =
      a.lastMessageAt || a.startAt || "1970-01-01T00:00:00.000Z";
    const bValue =
      b.lastMessageAt || b.startAt || "1970-01-01T00:00:00.000Z";
    return new Date(bValue).getTime() - new Date(aValue).getTime();
  });

  const requestedThreadParam = query.thread || "";
  const requestedThread = requestedThreadParam
    ? threads.find(
        (thread) =>
          thread.id === requestedThreadParam ||
          (requestedThreadParam.startsWith("inquiry:") &&
            thread.conversationId ===
              requestedThreadParam.slice("inquiry:".length)),
      )?.id || null
    : null;

  const legacyBookingThread =
    query.booking &&
    threads.some(
      (thread) =>
        thread.kind === "BOOKING" &&
        thread.bookingId === query.booking,
    )
      ? "booking:" + query.booking
      : null;

  const initialThreadId =
    requestedThread || legacyBookingThread || threads[0]?.id || null;

  let initialMessages: InboxMessage[] = [];
  const initialThread =
    threads.find((thread) => thread.id === initialThreadId) || null;

  if (initialThread?.kind === "BOOKING" && initialThread.bookingId) {
    const conversation = await db.conversation.findUnique({
      where: { bookingId: initialThread.bookingId },
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
  } else if (
    initialThread?.kind === "INQUIRY" &&
    initialThread.conversationId
  ) {
    const conversation = await db.conversation.findFirst({
      where: {
        id: initialThread.conversationId,
        bookingId: null,
        OR: [
          { creatorId: user.id },
          {
            ownerId: user.id,
            studio: { ownerId: user.id },
          },
        ],
      },
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
              Studio inquiries and booking conversations will appear here.
            </p>
          </div>
        ) : (
          <MessagingInbox
            userId={user.id}
            threads={threads}
            initialBookingId={initialThreadId}
            initialMessages={initialMessages}
          />
        )}
      </section>
    </main>
  );
}
