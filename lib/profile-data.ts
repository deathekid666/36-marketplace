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
  const hasCreatorActivity =
    user.role === "CREATOR" || user.role === "STUDIO_OWNER";

  const [
    creatorCompletedSessions,
    hostedCompletedSessions,
    creatorReviewCount,
    ownerReviewCount,
    ownerRating,
    creatorReviews,
    ownerReviews,
    studios,
    profileImages,
  ] = await Promise.all([
    hasCreatorActivity
      ? db.booking.count({
          where: {
            creatorId: user.id,
            status: "COMPLETED",
          },
        })
      : Promise.resolve(0),
    isOwner
      ? db.booking.count({
          where: {
            studio: { ownerId: user.id },
            status: "COMPLETED",
          },
        })
      : Promise.resolve(0),
    hasCreatorActivity
      ? db.review.count({
          where: { creatorId: user.id },
        })
      : Promise.resolve(0),
    isOwner
      ? db.review.count({
          where: {
            studio: { ownerId: user.id },
          },
        })
      : Promise.resolve(0),
    isOwner
      ? db.review.aggregate({
          where: {
            studio: { ownerId: user.id },
          },
          _avg: { rating: true },
        })
      : Promise.resolve({ _avg: { rating: null } }),
    hasCreatorActivity
      ? db.review.findMany({
          where: { creatorId: user.id },
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

  const combinedReviews = [
    ...ownerReviews.map((review) => ({
      ...review,
      profileDirection: "RECEIVED" as const,
    })),
    ...creatorReviews.map((review) => ({
      ...review,
      profileDirection: "WRITTEN" as const,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .filter(
      (review, index, rows) =>
        rows.findIndex((candidate) => candidate.id === review.id) === index,
    )
    .slice(0, 12);

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
    completedSessions:
      creatorCompletedSessions + hostedCompletedSessions,
    creatorCompletedSessions,
    hostedCompletedSessions,
    reviewsWritten: creatorReviewCount,
    reviewsReceived: ownerReviewCount,
    averageRating: ownerRating._avg.rating,
    studios,
    reviews: combinedReviews,
  };
}
