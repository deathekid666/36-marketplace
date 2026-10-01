import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireRole } from "@/lib/auth";

export async function requireOwnedStudio(id: string) {
  const user = await requireRole("STUDIO_OWNER");
  const studio = await db.studio.findFirst({
    where: { id, ownerId: user.id },
    include: {
      rooms: {
        orderBy: { createdAt: "asc" },
        include: { equipment: true, blockedSlots: { orderBy: { startAt: "asc" } } },
      },
      photos: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      amenities: { orderBy: { name: "asc" } },
      openingHours: { orderBy: { dayOfWeek: "asc" } },
      addons: { orderBy: { createdAt: "asc" } },
      discoveryCandidate: {
        include: {
          transitions: {
            where: { reasonCode: "VERIFIED_OWNER_PROFILE_UPDATE" },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { metadata: true },
          },
        },
      },
    },
  });
  if (!studio) notFound();
  return { user, studio };
}
