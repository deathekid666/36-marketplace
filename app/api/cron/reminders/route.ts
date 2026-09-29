import { NextResponse } from "next/server";
import { sendDueBookingReminders } from "@/lib/reminders";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sent = await sendDueBookingReminders(100);
  return NextResponse.json({ ok: true, sent });
}
