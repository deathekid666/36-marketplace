"use server";

import { Prisma } from "@prisma/client";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";

function text(form: FormData, name: string, max = 120) {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

export async function startStudioConversationAction(form: FormData) {
  const user = await requireRole("CREATOR");
  const studioId = text(form, "studioId", 80);

  const studio = await db.studio.findFirst({
    where: { id: studioId, status: "VERIFIED" },
    select: { id: true, ownerId: true },
  });

  if (!studio) {
    redirect("/studios");
  }

  let conversation = await db.conversation.findFirst({
    where: {
      bookingId: null,
      studioId: studio.id,
      creatorId: user.id,
    },
    select: { id: true },
  });

  if (!conversation) {
    try {
      conversation = await db.conversation.create({
        data: {
          studioId: studio.id,
          creatorId: user.id,
          ownerId: studio.ownerId,
        },
        select: { id: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        conversation = await db.conversation.findFirst({
          where: {
            bookingId: null,
            studioId: studio.id,
            creatorId: user.id,
          },
          select: { id: true },
        });
      } else {
        throw error;
      }
    }
  }

  if (!conversation) {
    redirect("/studios");
  }

  redirect("/messages?thread=inquiry:" + conversation.id);
}
