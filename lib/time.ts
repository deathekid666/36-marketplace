export const MARKETPLACE_TIME_ZONE = "Africa/Casablanca";

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsInZone(date: Date, timeZone = MARKETPLACE_TIME_ZONE): DateParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function pseudoUtc(parts: DateParts) {
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

export function zonedLocalToUtc(dateValue: string, timeValue: string, timeZone = MARKETPLACE_TIME_ZONE) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) return null;

  const desired: DateParts = { year, month, day, hour, minute, second: 0 };
  let guess = pseudoUtc(desired);
  for (let i = 0; i < 3; i += 1) {
    const actual = partsInZone(new Date(guess), timeZone);
    guess += pseudoUtc(desired) - pseudoUtc(actual);
  }
  const result = new Date(guess);
  return Number.isFinite(result.getTime()) ? result : null;
}

export function casablancaDateTimeLocalToUtc(value: string) {
  const [date, time] = value.split("T");
  if (!date || !time) return null;
  return zonedLocalToUtc(date, time.slice(0, 5));
}

export function localDateParts(date: Date, timeZone = MARKETPLACE_TIME_ZONE) {
  return partsInZone(date, timeZone);
}

export function localDateKey(date: Date, timeZone = MARKETPLACE_TIME_ZONE) {
  const p = partsInZone(date, timeZone);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function mondayIndexForDateKey(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const jsDay = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (jsDay + 6) % 7;
}

export function formatMarketplaceDateTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    timeZone: MARKETPLACE_TIME_ZONE,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatMarketplaceTime(date: Date) {
  return new Intl.DateTimeFormat("en", {
    timeZone: MARKETPLACE_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function toMarketplaceDateTimeLocal(date: Date) {
  const p = localDateParts(date);
  return `${String(p.year).padStart(4, "0")}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}T${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}
