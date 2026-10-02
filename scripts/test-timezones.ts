import {
  formatMarketplaceTime,
  localDateKey,
  timeZoneForCoordinates,
  zonedLocalToUtc,
} from "../lib/time";

function assert(condition: unknown, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertZone(
  latitude: number,
  longitude: number,
  expected: string,
) {
  const actual = timeZoneForCoordinates(latitude, longitude);
  assert(
    actual === expected,
    `Expected timezone ${expected}, got ${actual}`,
  );
}

function assertRoundTrip(
  date: string,
  time: string,
  timeZone: string,
) {
  const utc = zonedLocalToUtc(date, time, timeZone);
  assert(utc, `Could not convert ${date} ${time} in ${timeZone}`);
  assert(
    formatMarketplaceTime(utc!, timeZone) === time,
    `Time round-trip failed for ${timeZone}`,
  );
  assert(
    localDateKey(utc!, timeZone) === date,
    `Date round-trip failed for ${timeZone}`,
  );
}

assertZone(33.5731, -7.5898, "Africa/Casablanca");
assertZone(40.7128, -74.006, "America/New_York");
assertZone(35.6762, 139.6503, "Asia/Tokyo");
assertZone(51.5074, -0.1278, "Europe/London");

assertRoundTrip("2026-10-02", "09:00", "Africa/Casablanca");
assertRoundTrip("2026-10-02", "09:00", "America/New_York");
assertRoundTrip("2026-10-02", "09:00", "Asia/Tokyo");
assertRoundTrip("2026-10-02", "09:00", "Europe/London");

// DST transition days must still preserve the local wall-clock for valid times.
assertRoundTrip("2026-03-08", "13:30", "America/New_York");
assertRoundTrip("2026-10-25", "13:30", "Europe/London");

console.log("Timezone fixtures passed");
