import { NextResponse } from "next/server";
import { sendDueBookingReminders } from "@/lib/reminders";
import { expireStaleBookingHolds } from "@/lib/booking-lifecycle";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const expiredHolds = await expireStaleBookingHolds({ limit: 250 });
  const reminders = await sendDueBookingReminders(100);
  return NextResponse.json({
    ok: true,
    reminders,
    expiredHolds,
  });
}
