function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char] || char));
}

export async function sendTransactionalEmail(input: { to: string; subject: string; title: string; body: string; href?: string; cta?: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFICATION_FROM_EMAIL;
  if (!apiKey || !from) return { sent: false as const, reason: "EMAIL_NOT_CONFIGURED" };

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const href = input.href ? (input.href.startsWith("http") ? input.href : `${siteUrl}${input.href}`) : "";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [input.to],
      subject: input.subject,
      html: `<div style="font-family:Arial,sans-serif;background:#070806;color:#f4f2ea;padding:32px"><div style="font-size:28px;font-weight:900;color:#d9ff43">36</div><h2>${escapeHtml(input.title)}</h2><p style="line-height:1.65;color:#b7bab2">${escapeHtml(input.body)}</p>${href ? `<p style="margin-top:24px"><a href="${href}" style="background:#d9ff43;color:#070806;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:800">${escapeHtml(input.cta || "Open 36")}</a></p>` : ""}</div>`,
    }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(json?.message || `Email provider HTTP ${response.status}`));
  return { sent: true as const, id: String(json?.id || "") };
}
