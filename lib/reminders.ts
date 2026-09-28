import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";

export async function scheduleBookingReminders(bookingId: string) {
  const booking = await db.booking.findUnique({ where: { id: bookingId }, select: { id: true, startAt: true } });
  if (!booking) return;
  const candidates = [
    { kind: "24H", sendAt: new Date(booking.startAt.getTime() - 24 * 60 * 60 * 1000) },
    { kind: "2H", sendAt: new Date(booking.startAt.getTime() - 2 * 60 * 60 * 1000) },
  ].filter((x) => x.sendAt > new Date());
  await Promise.all(candidates.map((x) => db.bookingReminder.upsert({ where: { bookingId_kind: { bookingId, kind: x.kind } }, create: { bookingId, kind: x.kind, sendAt: x.sendAt }, update: { sendAt: x.sendAt, sentAt: null } })));
}

export async function sendDueBookingReminders(limit = 50) {
  const due = await db.bookingReminder.findMany({
    where: { sentAt: null, sendAt: { lte: new Date() }, booking: { status: "CONFIRMED", startAt: { gt: new Date() } } },
    include: { booking: { include: { creator: true, studio: true } } },
    orderBy: { sendAt: "asc" },
    take: limit,
  });
  let sent = 0;
  for (const reminder of due) {
    const booking = reminder.booking;
    await notifyUser({
      userId: booking.creatorId,
      type: `BOOKING_REMINDER_${reminder.kind}`,
      title: reminder.kind === "24H" ? "Your studio session is tomorrow" : "Your studio session starts soon",
      body: `${booking.studio.name} · ${booking.startAt.toLocaleString("en-US", { timeZone: "Africa/Casablanca", dateStyle: "medium", timeStyle: "short" })}`,
      href: `/creator/bookings/${booking.id}`,
      email: true,
      whatsapp: true,
    });
    await db.bookingReminder.update({ where: { id: reminder.id }, data: { sentAt: new Date() } });
    sent += 1;
  }
  return sent;
}
