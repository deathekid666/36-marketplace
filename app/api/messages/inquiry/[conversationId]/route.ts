import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function accessibleInquiry(
  conversationId: string,
  userId: string,
  role: string,
) {
  const conversation = await db.conversation.findFirst({
    where: {
      id: conversationId,
      bookingId: null,
      studioId: { not: null },
      creatorId: { not: null },
      ownerId: { not: null },
    },
    include: {
      creator: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      studio: {
        select: {
          id: true,
          name: true,
          slug: true,
          ownerId: true,
        },
      },
    },
  });

  if (!conversation || !conversation.studio) return null;
  if (
    role === "CREATOR" &&
    conversation.creatorId === userId
  ) {
    return conversation;
  }
  if (
    role === "STUDIO_OWNER" &&
    conversation.ownerId === userId &&
    conversation.studio.ownerId === userId
  ) {
    return conversation;
  }
  return null;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !["CREATOR", "STUDIO_OWNER"].includes(user.role)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { conversationId } = await params;
  const conversation = await accessibleInquiry(
    conversationId,
    user.id,
    user.role,
  );
  if (!conversation) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const messages = await db.message.findMany({
    where: { conversationId: conversation.id },
    include: {
      sender: {
        select: { id: true, name: true },
      },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  return NextResponse.json({
    conversationId: conversation.id,
    messages: messages.map((message) => ({
      id: message.id,
      senderId: message.senderId,
      senderName: message.sender.name,
      body: message.body,
      createdAt: message.createdAt.toISOString(),
    })),
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !["CREATOR", "STUDIO_OWNER"].includes(user.role)) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const { conversationId } = await params;
  const conversation = await accessibleInquiry(
    conversationId,
    user.id,
    user.role,
  );
  if (!conversation || !conversation.studio) {
    return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
  }

  const payload = await request.json().catch(() => ({}));
  const body = String(payload?.body || "").trim().slice(0, 2000);
  if (!body) {
    return NextResponse.json({ error: "MESSAGE_REQUIRED" }, { status: 400 });
  }

  const message = await db.$transaction(async (tx) => {
    const created = await tx.message.create({
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

    await tx.conversation.update({
      where: { id: conversation.id },
      data: { updatedAt: new Date() },
    });

    return created;
  });

  const recipientId =
    user.role === "CREATOR"
      ? conversation.ownerId
      : conversation.creatorId;

  if (recipientId) {
    await notifyUser({
      userId: recipientId,
      type: "STUDIO_INQUIRY_MESSAGE",
      title: "New message about " + conversation.studio.name,
      body: body.slice(0, 180),
      href: "/messages?thread=inquiry:" + conversation.id,
      email: true,
    }).catch(() => undefined);
  }

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
