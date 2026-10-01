"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function markNotificationReadAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id") || "");
  await db.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

export async function markAllNotificationsReadAction() {
  const user = await requireUser();
  await db.notification.updateMany({
    where: { userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath("/notifications");
}

export async function openNotificationAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id") || "");
  const requestedHref = String(form.get("href") || "");
  const href =
    requestedHref.startsWith("/") && !requestedHref.startsWith("//")
      ? requestedHref
      : "/notifications";

  await db.notification.updateMany({
    where: { id, userId: user.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath("/notifications");
  redirect(href);
}
