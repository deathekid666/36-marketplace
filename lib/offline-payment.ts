export const OFFLINE_PAYMENT_METHODS = [
  {
    value: "PAY_AT_STUDIO",
    label: "Pay at studio",
    description: "Confirm now and pay the studio directly when you arrive.",
  },
  {
    value: "CASH",
    label: "Cash",
    description: "Confirm now and settle the full amount in cash with the studio.",
  },
  {
    value: "BANK_TRANSFER",
    label: "Bank transfer",
    description: "Confirm now and arrange a direct bank transfer with the studio.",
  },
] as const;

export type OfflinePaymentMethod =
  (typeof OFFLINE_PAYMENT_METHODS)[number]["value"];

const OFFLINE_VALUES = new Set<string>(
  OFFLINE_PAYMENT_METHODS.map((method) => method.value),
);

export function parseOfflinePaymentMethod(
  value: unknown,
): OfflinePaymentMethod | null {
  const raw = String(value || "").trim().toUpperCase();
  return OFFLINE_VALUES.has(raw)
    ? (raw as OfflinePaymentMethod)
    : null;
}

export function offlinePaymentLabel(value: string | null | undefined) {
  const method = OFFLINE_PAYMENT_METHODS.find(
    (item) => item.value === String(value || "").toUpperCase(),
  );
  return method?.label || null;
}

export function isOfflinePaymentProvider(
  value: string | null | undefined,
) {
  return Boolean(offlinePaymentLabel(value));
}
