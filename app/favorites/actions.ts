"use server";

import { revalidatePath } from "next/cache";
import { requireCreatorAccess } from "@/lib/auth";
import { db } from "@/lib/db";
import { trackMarketplaceEvent } from "@/lib/analytics";

export async function toggleFavoriteAction(form: FormData) {
  const user = await requireCreatorAccess();
  const studioId = String(form.get("studioId") || "");
  const returnTo = String(form.get("returnTo") || "/creator/favorites");
  const studio = await db.studio.findFirst({ where: { id: studioId, status: "VERIFIED" }, select: { id: true } });
  if (!studio) return;
  const existing = await db.favorite.findUnique({ where: { userId_studioId: { userId: user.id, studioId } } });
  if (existing) await db.favorite.delete({ where: { id: existing.id } });
  else {
    await db.favorite.create({ data: { userId: user.id, studioId } });
    await trackMarketplaceEvent({ eventType: "FAVORITE", userId: user.id, studioId });
  }
  revalidatePath(returnTo);
  revalidatePath("/creator/favorites");
  revalidatePath("/studios");
}
