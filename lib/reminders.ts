import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";
import {
  formatMarketplaceDateTime,
  studioTimeZone,
} from "@/lib/time";

export async function scheduleBookingReminders(bookingId: string) {
  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    select: { id: true, startAt: true },
  });
  if (!booking) return;

  const now = new Date();
  const candidates = [
    {
      kind: "24H",
      sendAt: new Date(
        booking.startAt.getTime() - 24 * 60 * 60 * 1000,
      ),
    },
    {
      kind: "2H",
      sendAt: new Date(
        booking.startAt.getTime() - 2 * 60 * 60 * 1000,
      ),
    },
  ].filter((candidate) => candidate.sendAt > now);

  await Promise.all(
    candidates.map((candidate) =>
      db.bookingReminder.upsert({
        where: {
          bookingId_kind: {
            bookingId,
            kind: candidate.kind,
          },
        },
        create: {
          bookingId,
          kind: candidate.kind,
          sendAt: candidate.sendAt,
        },
        update: {
          sendAt: candidate.sendAt,
        },
      }),
    ),
  );
}

export async function sendDueBookingReminders(limit = 50) {
  const due = await db.bookingReminder.findMany({
    where: {
      sentAt: null,
      sendAt: { lte: new Date() },
      booking: {
        status: "CONFIRMED",
        startAt: { gt: new Date() },
      },
    },
    include: {
      booking: {
        include: {
          creator: true,
          studio: true,
        },
      },
    },
    orderBy: { sendAt: "asc" },
    take: limit,
  });

  let sent = 0;
  let failed = 0;

  for (const reminder of due) {
    const claimedAt = new Date();
    const claim = await db.bookingReminder.updateMany({
      where: {
        id: reminder.id,
        sentAt: null,
      },
      data: {
        sentAt: claimedAt,
      },
    });

    if (!claim.count) continue;

    const booking = reminder.booking;
    const timeZone = studioTimeZone(booking.studio);
    const sessionTime = formatMarketplaceDateTime(
      booking.startAt,
      timeZone,
    );

    try {
      await notifyUser({
        userId: booking.creatorId,
        type: "BOOKING_REMINDER_" + reminder.kind,
        title:
          reminder.kind === "24H"
            ? "Your studio session is tomorrow"
            : "Your studio session starts soon",
        body:
          booking.studio.name +
          " · " +
          sessionTime +
          " · " +
          timeZone,
        href: "/creator/bookings/" + booking.id,
        email: true,
        whatsapp: true,
      });
      sent += 1;
    } catch {
      failed += 1;
      await db.bookingReminder.updateMany({
        where: {
          id: reminder.id,
          sentAt: claimedAt,
        },
        data: {
          sentAt: null,
        },
      });
    }
  }

  return { sent, failed };
}
