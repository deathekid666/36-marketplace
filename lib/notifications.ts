import type { NotificationChannel } from "@prisma/client";
import { db } from "@/lib/db";

type NotifyInput = {
  userId: string;
  type: string;
  title: string;
  body?: string;
  href?: string;
  email?: boolean;
  whatsapp?: boolean;
};

async function deliverEmail(notificationId: string, to: string, title: string, body: string, href: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_FROM_EMAIL;
  if (!apiKey || !from) {
    await db.notificationDelivery.create({ data: { notificationId, channel: "EMAIL", status: "SKIPPED", provider: "RESEND", error: "Email provider not configured" } });
    return;
  }
  try {
    const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: title,
        html: `<div style="font-family:Arial,sans-serif;background:#070806;color:#f4f2ea;padding:28px"><h1 style="color:#d9ff43">36</h1><h2>${escapeHtml(title)}</h2><p style="color:#b5b7ae;line-height:1.6">${escapeHtml(body)}</p>${href ? `<p><a style="color:#d9ff43" href="${siteUrl}${href}">Open in 36</a></p>` : ""}</div>`,
      }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(json?.message || response.status));
    await db.notificationDelivery.create({ data: { notificationId, channel: "EMAIL", status: "SENT", provider: "RESEND", providerRef: String(json?.id || ""), sentAt: new Date() } });
  } catch (error) {
    await db.notificationDelivery.create({ data: { notificationId, channel: "EMAIL", status: "FAILED", provider: "RESEND", error: error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed" } });
  }
}

async function deliverWhatsApp(notificationId: string, phone: string, title: string, body: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const template = process.env.WHATSAPP_TEMPLATE_NAME;
  const language = process.env.WHATSAPP_TEMPLATE_LANG || "en_US";
  const graphVersion = process.env.WHATSAPP_GRAPH_VERSION || "v23.0";
  if (!token || !phoneNumberId || !template) {
    await db.notificationDelivery.create({ data: { notificationId, channel: "WHATSAPP", status: "SKIPPED", provider: "META", error: "WhatsApp provider/template not configured" } });
    return;
  }
  try {
    const response = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: phone.replace(/[^0-9]/g, ""),
        type: "template",
        template: {
          name: template,
          language: { code: language },
          components: [{ type: "body", parameters: [{ type: "text", text: title.slice(0, 120) }, { type: "text", text: body.slice(0, 500) }] }],
        },
      }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(json?.error?.message || response.status));
    await db.notificationDelivery.create({ data: { notificationId, channel: "WHATSAPP", status: "SENT", provider: "META", providerRef: String(json?.messages?.[0]?.id || ""), sentAt: new Date() } });
  } catch (error) {
    await db.notificationDelivery.create({ data: { notificationId, channel: "WHATSAPP", status: "FAILED", provider: "META", error: error instanceof Error ? error.message.slice(0, 500) : "WhatsApp delivery failed" } });
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] || char));
}

export async function notifyUser(input: NotifyInput) {
  const user = await db.user.findUnique({ where: { id: input.userId }, select: { id: true, email: true, phone: true } });
  if (!user) return null;
  const notification = await db.notification.create({
    data: { userId: user.id, type: input.type.slice(0, 80), title: input.title.slice(0, 180), body: (input.body || "").slice(0, 1200), href: (input.href || "").slice(0, 500) },
  });
  await db.notificationDelivery.create({ data: { notificationId: notification.id, channel: "IN_APP" as NotificationChannel, status: "SENT", provider: "36", sentAt: new Date() } });
  if (input.email) await deliverEmail(notification.id, user.email, input.title, input.body || "", input.href || "");
  if (input.whatsapp && user.phone) await deliverWhatsApp(notification.id, user.phone, input.title, input.body || "");
  return notification;
}
