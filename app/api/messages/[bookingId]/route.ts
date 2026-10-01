import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function accessibleBooking(
  bookingId: string,
  userId: string,
  role: string,
) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      creator: {
        select: { id: true, name: true },
      },
      studio: {
        select: {
          id: true,
          name: true,
          slug: true,
          ownerId: true,
          owner: {
            select: { id: true, name: true },
          },
        },
      },
      room: {
        select: { id: true, name: true },
      },
    },
  });

  if (!booking) return null;
  if (role === "CREATOR" && booking.creatorId === userId) return booking;
  if (role === "STUDIO_OWNER" && booking.studio.ownerId === userId) return booking;
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !["CREATOR", "STUDIO_OWNER"].includes(user.role)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { bookingId } = await params;
  const booking = await accessibleBooking(bookingId, user.id, user.role);
  if (!booking) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const conversation = await db.conversation.findUnique({
    where: { bookingId },
    include: {
      messages: {
        include: {
          sender: {
            select: { id: true, name: true },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 200,
      },
    },
  });

  return NextResponse.json({
    bookingId,
    messages:
      conversation?.messages.map((message) => ({
        id: message.id,
        senderId: message.senderId,
        senderName: message.sender.name,
        body: message.body,
        createdAt: message.createdAt.toISOString(),
      })) || [],
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !["CREATOR", "STUDIO_OWNER"].includes(user.role)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { bookingId } = await params;
  const booking = await accessibleBooking(bookingId, user.id, user.role);
  if (!booking) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const payload = await request.json().catch(() => ({}));
  const body = String(payload?.body || "").trim().slice(0, 2000);
  if (!body) {
    return NextResponse.json({ error: "MESSAGE_REQUIRED" }, { status: 400 });
  }

  const conversation = await db.conversation.upsert({
    where: { bookingId },
    create: { bookingId },
    update: {},
  });

  const message = await db.message.create({
    data: {
      conversationId: conversation.id,
      senderId: user.id,
      body,
    },
    include: {
      sender: {
        select: { id: true, name: true },
      },
    },
  });

  const recipientId =
    user.role === "CREATOR"
      ? booking.studio.ownerId
      : booking.creatorId;

  await notifyUser({
    userId: recipientId,
    type: "BOOKING_MESSAGE",
    title: "New message about " + booking.studio.name,
    body: body.slice(0, 180),
    href: "/messages?booking=" + booking.id,
    email: true,
  }).catch(() => undefined);

  return NextResponse.json({
    message: {
      id: message.id,
      senderId: message.senderId,
      senderName: message.sender.name,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    },
  });
}
