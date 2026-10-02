import tzlookup from "@photostructure/tz-lookup";

export const MARKETPLACE_TIME_ZONE = "Africa/Casablanca";

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function partsInZone(
  date: Date,
  timeZone = MARKETPLACE_TIME_ZONE,
): DateParts {
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
  const get = (type: string) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
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
  return Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

export function timeZoneForCoordinates(
  latitude: unknown,
  longitude: unknown,
  fallback = MARKETPLACE_TIME_ZONE,
) {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return fallback;
  }

  try {
    return tzlookup(lat, lng) || fallback;
  } catch {
    return fallback;
  }
}

export function studioTimeZone(studio: {
  timeZone?: string | null;
  latitude?: unknown | null;
  longitude?: unknown | null;
}) {
  const stored = String(studio.timeZone || "").trim();
  if (stored) {
    try {
      new Intl.DateTimeFormat("en", { timeZone: stored }).format(new Date());
      return stored;
    } catch {
      // Fall back to coordinate lookup below.
    }
  }

  return timeZoneForCoordinates(
    studio.latitude,
    studio.longitude,
  );
}

export function zonedLocalToUtc(
  dateValue: string,
  timeValue: string,
  timeZone = MARKETPLACE_TIME_ZONE,
) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const [hour, minute] = timeValue.split(":").map(Number);
  if (![year, month, day, hour, minute].every(Number.isFinite)) {
    return null;
  }

  const desired: DateParts = {
    year,
    month,
    day,
    hour,
    minute,
    second: 0,
  };
  let guess = pseudoUtc(desired);

  for (let index = 0; index < 3; index += 1) {
    const actual = partsInZone(new Date(guess), timeZone);
    guess += pseudoUtc(desired) - pseudoUtc(actual);
  }

  const result = new Date(guess);
  return Number.isFinite(result.getTime()) ? result : null;
}

export function marketplaceDateTimeLocalToUtc(
  value: string,
  timeZone = MARKETPLACE_TIME_ZONE,
) {
  const [date, time] = value.split("T");
  if (!date || !time) return null;
  return zonedLocalToUtc(date, time.slice(0, 5), timeZone);
}

export function casablancaDateTimeLocalToUtc(value: string) {
  return marketplaceDateTimeLocalToUtc(
    value,
    MARKETPLACE_TIME_ZONE,
  );
}

export function localDateParts(
  date: Date,
  timeZone = MARKETPLACE_TIME_ZONE,
) {
  return partsInZone(date, timeZone);
}

export function localDateKey(
  date: Date,
  timeZone = MARKETPLACE_TIME_ZONE,
) {
  const parts = partsInZone(date, timeZone);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0"),
  ].join("-");
}

export function mondayIndexForDateKey(dateValue: string) {
  const [year, month, day] = dateValue.split("-").map(Number);
  const jsDay = new Date(
    Date.UTC(year, month - 1, day),
  ).getUTCDay();
  return (jsDay + 6) % 7;
}

export function formatMarketplaceDateTime(
  date: Date,
  timeZone = MARKETPLACE_TIME_ZONE,
) {
  return new Intl.DateTimeFormat("en", {
    timeZone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatMarketplaceTime(
  date: Date,
  timeZone = MARKETPLACE_TIME_ZONE,
) {
  return new Intl.DateTimeFormat("en", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function toMarketplaceDateTimeLocal(
  date: Date,
  timeZone = MARKETPLACE_TIME_ZONE,
) {
  const parts = localDateParts(date, timeZone);
  return [
    String(parts.year).padStart(4, "0"),
    "-",
    String(parts.month).padStart(2, "0"),
    "-",
    String(parts.day).padStart(2, "0"),
    "T",
    String(parts.hour).padStart(2, "0"),
    ":",
    String(parts.minute).padStart(2, "0"),
  ].join("");
}
