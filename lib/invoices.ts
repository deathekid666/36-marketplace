import { db } from "@/lib/db";

export async function ensureInvoice(bookingId: string) {
  const existing = await db.invoice.findUnique({ where: { bookingId } });
  if (existing) return existing;
  const booking = await db.booking.findUnique({ where: { id: bookingId }, include: { studio: true, creator: true } });
  if (!booking) return null;
  const number = `36-${new Date().getFullYear()}-${booking.id.slice(0, 8).toUpperCase()}`;
  const discountMad = Math.max(0, booking.promoDiscountMad);
  const taxBps = booking.taxBps || booking.studio.taxRateBps || 0;
  const taxAmountMad = Math.max(0, booking.taxAmountMad);
  const taxable = Math.max(0, booking.totalAmountMad - taxAmountMad);
  const subtotalMad = taxable + discountMad;
  const totalMad = booking.totalAmountMad;
  return db.invoice.create({ data: {
    bookingId: booking.id, number,
    sellerName: booking.studio.legalName || booking.studio.name,
    sellerTaxId: booking.studio.taxId,
    sellerIce: booking.studio.ice,
    buyerName: booking.creator.name,
    buyerEmail: booking.creator.email,
    subtotalMad, discountMad, taxBps, taxAmountMad, totalMad,
  }});
}
