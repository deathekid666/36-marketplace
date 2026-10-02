"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireVerifiedRole } from "@/lib/auth";
import { db } from "@/lib/db";

export async function enableHostingAction() {
  const user = await requireVerifiedRole("CREATOR");

  await db.user.updateMany({
    where: {
      id: user.id,
      role: "CREATOR",
      status: "ACTIVE",
    },
    data: {
      role: "STUDIO_OWNER",
    },
  });

  revalidatePath("/dashboard");
  revalidatePath("/profile");
  revalidatePath("/list-your-studio");
  revalidatePath("/creator");
  revalidatePath("/owner");

  redirect("/owner/studios/new");
}
