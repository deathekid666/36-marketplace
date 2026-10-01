"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export async function updateProfileAction(formData: FormData) {
  const user = await requireUser();

  const name = String(formData.get("name") || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 100);
  const phone = String(formData.get("phone") || "")
    .trim()
    .slice(0, 40);

  if (name.length < 2) {
    redirect("/profile?error=name");
  }

  if (phone && !/^[+0-9()\-\s.]{6,40}$/.test(phone)) {
    redirect("/profile?error=phone");
  }

  await db.user.update({
    where: { id: user.id },
    data: {
      name,
      phone: phone || null,
    },
  });

  revalidatePath("/profile");
  revalidatePath("/profile/" + user.id);
  redirect("/profile?saved=1");
}
