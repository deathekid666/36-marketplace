export function bookingFinancials(totalAmountMad: number, commissionBps: number) {
  const gross = Math.max(0, Math.round(totalAmountMad));
  const bps = Math.max(0, Math.min(5000, Math.round(commissionBps)));
  const commissionAmountMad = Math.round((gross * bps) / 10000);
  return {
    grossAmountMad: gross,
    commissionBps: bps,
    commissionAmountMad,
    studioNetAmountMad: Math.max(0, gross - commissionAmountMad),
  };
}

export function formatMad(value: number) {
  return `${Math.round(value).toLocaleString("en-US")} MAD`;
}
