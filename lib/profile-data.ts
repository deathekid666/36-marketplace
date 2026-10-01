import { db } from "@/lib/db";

export async function loadPublicProfile(userId: string) {
  const user = await db.user.findFirst({
    where: {
      id: userId,
      status: "ACTIVE",
    },
    select: {
      id: true,
      name: true,
      role: true,
      emailVerifiedAt: true,
      createdAt: true,
    },
  });

  if (!user) return null;

  const isOwner = user.role === "STUDIO_OWNER";
  const isCreator = user.role === "CREATOR";

  const [completedSessions, creatorReviews, ownerReviews, studios, profileImages] =
    await Promise.all([
      isCreator
        ? db.booking.count({
            where: {
              creatorId: user.id,
              status: "COMPLETED",
            },
          })
        : isOwner
          ? db.booking.count({
              where: {
                studio: { ownerId: user.id },
                status: "COMPLETED",
              },
            })
          : Promise.resolve(0),
      isCreator
        ? db.review.findMany({
            where: { creatorId: user.id },
            include: {
              studio: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 8,
          })
        : Promise.resolve([]),
      isOwner
        ? db.review.findMany({
            where: {
              studio: { ownerId: user.id },
            },
            include: {
              creator: {
                select: {
                  id: true,
                  name: true,
                },
              },
              studio: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                },
              },
            },
            orderBy: { createdAt: "desc" },
            take: 12,
          })
        : Promise.resolve([]),
      isOwner
        ? db.studio.findMany({
            where: {
              ownerId: user.id,
              status: "VERIFIED",
            },
            include: {
              photos: {
                orderBy: { sortOrder: "asc" },
                take: 1,
              },
              rooms: {
                where: { active: true },
                orderBy: { hourlyRateMad: "asc" },
                take: 1,
              },
              reviews: {
                select: { rating: true },
              },
            },
            orderBy: [
              { verifiedAt: "desc" },
              { name: "asc" },
            ],
            take: 12,
          })
        : Promise.resolve([]),
      db.storedFile.findMany({
        where: {
          ownerId: user.id,
          kind: { in: ["PROFILE_AVATAR", "PROFILE_COVER"] },
        },
        orderBy: { createdAt: "desc" },
        select: {
          kind: true,
          url: true,
        },
      }),
    ]);

  const publicReviews = isOwner ? ownerReviews : creatorReviews;
  const averageRating =
    isOwner && ownerReviews.length
      ? ownerReviews.reduce(
          (sum, review) => sum + review.rating,
          0,
        ) / ownerReviews.length
      : null;

  const avatarUrl =
    profileImages.find((file) => file.kind === "PROFILE_AVATAR")?.url || null;
  const coverUrl =
    profileImages.find((file) => file.kind === "PROFILE_COVER")?.url || null;

  return {
    user: {
      ...user,
      avatarUrl,
      coverUrl,
    },
    completedSessions,
    reviewsWritten: isCreator ? creatorReviews.length : 0,
    reviewsReceived: isOwner ? ownerReviews.length : 0,
    averageRating,
    studios,
    reviews: publicReviews,
  };
}
