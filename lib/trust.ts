import { db } from "@/lib/db";

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
    : sorted[middle];
}

export async function getStudioTrustMetrics(
  studioId: string,
  ownerId: string,
) {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  const [completedSessions, reviewAggregate, conversations] =
    await Promise.all([
      db.booking.count({
        where: {
          studioId,
          status: "COMPLETED",
        },
      }),
      db.review.aggregate({
        where: { studioId },
        _count: { _all: true },
        _avg: {
          rating: true,
          accuracy: true,
          equipment: true,
          communication: true,
        },
      }),
      db.conversation.findMany({
        where: {
          OR: [
            {
              studioId,
              createdAt: { gte: since },
            },
            {
              booking: {
                studioId,
                createdAt: { gte: since },
              },
            },
          ],
        },
        include: {
          messages: {
            orderBy: { createdAt: "asc" },
            select: {
              senderId: true,
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
    ]);

  let eligibleConversations = 0;
  let respondedConversations = 0;
  const responseMinutes: number[] = [];

  for (const conversation of conversations) {
    const firstCreatorMessage = conversation.messages.find(
      (message) => message.senderId !== ownerId,
    );
    if (!firstCreatorMessage) continue;

    eligibleConversations += 1;

    const firstOwnerReply = conversation.messages.find(
      (message) =>
        message.senderId === ownerId &&
        message.createdAt > firstCreatorMessage.createdAt,
    );

    if (!firstOwnerReply) continue;

    respondedConversations += 1;
    responseMinutes.push(
      Math.max(
        0,
        Math.round(
          (firstOwnerReply.createdAt.getTime() -
            firstCreatorMessage.createdAt.getTime()) /
            60000,
        ),
      ),
    );
  }

  const responseRate =
    eligibleConversations > 0
      ? Math.round(
          (respondedConversations / eligibleConversations) * 100,
        )
      : null;

  return {
    completedSessions,
    verifiedReviewCount: reviewAggregate._count._all,
    averageRating: reviewAggregate._avg.rating,
    averageAccuracy: reviewAggregate._avg.accuracy,
    averageEquipment: reviewAggregate._avg.equipment,
    averageCommunication: reviewAggregate._avg.communication,
    responseRate,
    typicalResponseMinutes: median(responseMinutes),
    responseSampleSize: eligibleConversations,
  };
}

export function responseTimeLabel(minutes: number | null) {
  if (minutes == null) return null;
  if (minutes < 2) return "usually within a few minutes";
  if (minutes < 60) return "usually within " + minutes + " min";
  const hours = Math.max(1, Math.round(minutes / 60));
  if (hours < 24) return "usually within " + hours + "h";
  const days = Math.max(1, Math.round(hours / 24));
  return "usually within " + days + " day" + (days === 1 ? "" : "s");
}
