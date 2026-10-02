import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();

function source(path) {
  return readFileSync(resolve(root, path), "utf8");
}

function fail(message) {
  throw new Error("\nCRITICAL REGRESSION GUARD FAILED\n" + message);
}

function mustInclude(path, text, reason) {
  const value = source(path);
  if (!value.includes(text)) {
    fail(path + " no longer satisfies: " + reason + "\nMissing contract: " + text);
  }
}

function mustNotInclude(path, text, reason) {
  const value = source(path);
  if (value.includes(text)) {
    fail(path + " violates: " + reason + "\nForbidden contract: " + text);
  }
}

function occurrenceCount(path, text) {
  return source(path).split(text).length - 1;
}

const MAP_PAGE = "app/studios/page.tsx";
const MAP_COMPONENT = "components/CreativeExplorerMap.tsx";
const MAP_API = "app/api/map/creative-spaces/route.ts";

// Global map contract: /studios must use the server-driven explorer, never the legacy map.
mustInclude(
  MAP_PAGE,
  'import { CreativeExplorerMap } from "@/components/CreativeExplorerMap";',
  "/studios uses the global CreativeExplorerMap",
);
mustInclude(
  MAP_PAGE,
  "<CreativeExplorerMap",
  "/studios actually renders the global explorer",
);
mustNotInclude(
  MAP_PAGE,
  'import { StudioMap }',
  "the legacy StudioMap must not return to /studios",
);
mustNotInclude(
  MAP_PAGE,
  'query.city || "Casablanca"',
  "/studios must not silently force Casablanca as the default city",
);

// Browser map must keep using the dedicated map API and worldwide initial view.
mustInclude(
  MAP_COMPONENT,
  '"/api/map/creative-spaces?" + params.toString()',
  "the map loads its data from the server-driven creative-spaces API",
);
mustInclude(
  MAP_COMPONENT,
  "center: [20, 0]",
  "the map opens on a worldwide view",
);
mustInclude(
  MAP_COMPONENT,
  "zoom: 2",
  "the map opens at world zoom",
);

// API must continue combining verified/bookable supply with contact-only discovery supply.
mustInclude(
  MAP_API,
  "db.candidateStudio.findMany",
  "contact-only discovered studios remain part of map supply",
);
mustInclude(
  MAP_API,
  "db.studio.findMany",
  "verified bookable studios remain part of map supply",
);
mustInclude(
  MAP_API,
  'id: "contact:" + candidate.id',
  "contact-only map nodes retain stable identities",
);
mustInclude(
  MAP_API,
  'href: "/discover/" + candidate.slug',
  "contact-only nodes route to /discover",
);
mustInclude(
  MAP_API,
  'kind: "CONTACT" as const',
  "contact-only nodes remain distinguishable from bookable studios",
);
mustInclude(
  MAP_API,
  'id: "bookable:" + studio.id',
  "bookable map nodes retain stable identities",
);
mustInclude(
  MAP_API,
  'href: "/studios/" + studio.slug',
  "bookable nodes route to marketplace studio pages",
);
mustInclude(
  MAP_API,
  'kind: "BOOKABLE" as const',
  "bookable nodes remain distinguishable from contact-only studios",
);

// Zoom hierarchy is the core protection against the old 'world = 4 studios' regression.
mustInclude(MAP_API, "if (zoom <= 4)", "world zoom clusters by country");
mustInclude(MAP_API, 'level: "country"', "world zoom reports country level");
mustInclude(MAP_API, "if (zoom <= 7)", "mid zoom clusters by city");
mustInclude(MAP_API, 'level: "city"', "mid zoom reports city level");
mustInclude(MAP_API, "if (zoom <= 11)", "closer zoom clusters by category");
mustInclude(MAP_API, 'level: "category"', "closer zoom reports category level");
mustInclude(MAP_API, 'type: "place" as const', "close zoom returns individual places");
mustInclude(MAP_API, 'level: "place"', "close zoom reports place level");

// Creator + Host single-account contract.
const AUTH = "lib/auth.ts";
const HOSTING = "app/list-your-studio/actions.ts";
const BOOKING = "lib/booking.ts";
const BOOKING_MESSAGES = "app/api/messages/[bookingId]/route.ts";
const INQUIRY_MESSAGES = "app/api/messages/inquiry/[conversationId]/route.ts";

mustInclude(
  AUTH,
  'return role === "CREATOR" || role === "STUDIO_OWNER";',
  "a Studio Owner keeps Creator capabilities",
);
mustInclude(
  AUTH,
  'return requireRole("CREATOR", "STUDIO_OWNER");',
  "creator-only flows also accept Host accounts",
);
mustInclude(
  HOSTING,
  'requireVerifiedRole("CREATOR")',
  "hosting is enabled from the same verified Creator account",
);
mustInclude(
  HOSTING,
  'role: "STUDIO_OWNER"',
  "enabling hosting upgrades the same account instead of creating another account",
);

const selfBookingGuard =
  'throw new BookingConflictError("You cannot book your own studio.");';
if (occurrenceCount(BOOKING, selfBookingGuard) < 2) {
  fail(
    BOOKING +
      " must block self-booking in both quote and transactional booking paths.",
  );
}

// Messaging permissions must be based on the actual relationship to the booking/conversation.
mustInclude(
  BOOKING_MESSAGES,
  "if (booking.creatorId === userId) return booking;",
  "booking creator can access the booking thread",
);
mustInclude(
  BOOKING_MESSAGES,
  "if (booking.studio.ownerId === userId) return booking;",
  "studio owner can access the same booking thread",
);
mustInclude(
  BOOKING_MESSAGES,
  "booking.creatorId === user.id",
  "booking message recipient is derived from the user's side of the booking",
);
mustInclude(
  INQUIRY_MESSAGES,
  "conversation.creatorId === userId",
  "inquiry creator access is relationship-based",
);
mustInclude(
  INQUIRY_MESSAGES,
  "conversation.ownerId === userId",
  "inquiry owner access is relationship-based",
);
mustInclude(
  INQUIRY_MESSAGES,
  "conversation.creatorId === user.id",
  "inquiry message recipient is derived from conversation relationship",
);

console.log("Critical regression guards passed:");
console.log("- global map data/API and zoom hierarchy");
console.log("- /studios global map integration");
console.log("- Creator + Host single-account capability");
console.log("- self-booking protection");
console.log("- relationship-based messaging");
