import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

function icsDate(date: Date) {
  return date
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  const { id } = await params;
  const booking = await db.booking.findUnique({
    where: { id },
    include: {
      studio: true,
      room: true,
    },
  });

  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const allowed =
    user.role === "ADMIN" ||
    booking.creatorId === user.id ||
    booking.studio.ownerId === user.id;

  if (!allowed) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const canRevealExactLocation = [
    "CONFIRMED",
    "COMPLETED",
    "DISPUTED",
  ].includes(booking.status);

  const location = (
    canRevealExactLocation
      ? [
          booking.studio.address,
          booking.studio.neighborhood,
          booking.studio.city,
        ]
      : [booking.studio.neighborhood, booking.studio.city]
  )
    .filter(Boolean)
    .join(", ");

  const reference =
    "36-" + booking.id.replaceAll("-", "").slice(0, 8).toUpperCase();

  const body = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//36 Marketplace//Studio Booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:" + booking.id + "@36-marketplace",
    "DTSTAMP:" + icsDate(new Date()),
    "DTSTART:" + icsDate(booking.startAt),
    "DTEND:" + icsDate(booking.endAt),
    "SUMMARY:" +
      escapeIcs(booking.studio.name + " — " + booking.room.name),
    "DESCRIPTION:" +
      escapeIcs(
        "36 booking " +
          reference +
          ". Status: " +
          booking.status.replaceAll("_", " ") +
          "." +
          (canRevealExactLocation
            ? ""
            : " Exact studio address is revealed after booking confirmation."),
      ),
    location ? "LOCATION:" + escapeIcs(location) : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="' + reference.toLowerCase() + ".ics" + '"',
      "Cache-Control": "private, no-store",
    },
  });
}
