"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { normalizeCurrency } from "@/lib/commerce";
function text(f: FormData, n: string, m = 100) { return String(f.get(n) || "").trim().slice(0, m); }
export async function createPromoAction(form: FormData) {
  const admin = await requireRole("ADMIN");
  const code = text(form, "code", 32).toUpperCase().replace(/[^A-Z0-9_-]/g, "");
  const discountType = text(form, "discountType", 20) === "PERCENT" ? "PERCENT" : "FIXED_MAD";
  const currency = normalizeCurrency(form.get("currency"), "USD");
  let amount = Math.round(Number(form.get("amount")) || 0);
  if (discountType === "PERCENT") amount = Math.min(100, amount);
  const maxUsesRaw = Math.round(Number(form.get("maxUses")) || 0);
  if (!code || amount < 1) return;
  await db.promoCode.create({ data: { code, discountType, amount, currency, createdById: admin.id, minBookingMad: Math.max(0, Math.round(Number(form.get("minBookingMad")) || 0)), maxUses: maxUsesRaw > 0 ? maxUsesRaw : null, perUserLimit: Math.max(1, Math.round(Number(form.get("perUserLimit")) || 1)) } }).catch(() => undefined);
  revalidatePath("/admin/promos");
}
export async function togglePromoAction(form: FormData) {
  await requireRole("ADMIN");
  const id = text(form, "promoId", 80);
  const promo = await db.promoCode.findUnique({ where: { id } });
  if (!promo) return;
  await db.promoCode.update({ where: { id }, data: { active: !promo.active } });
  revalidatePath("/admin/promos");
}
