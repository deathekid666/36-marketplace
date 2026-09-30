import { db } from "@/lib/db";

const ALLOWED_EVENTS = new Set([
  "SEARCH",
  "STUDIO_VIEW",
  "FAVORITE",
  "BOOKING_STARTED",
  "BOOKING_CREATED",
  "REQUEST_CREATED",
  "OFFER_CREATED",
  "FLASH_VIEW",
  "DISCOVERY_SEARCH_IMPRESSION",
  "DISCOVERY_CLAIM_SUBMITTED",
  "DISCOVERY_CLAIM_VERIFIED",
  "DISCOVERY_CLAIM_REJECTED",
  "DISCOVERY_OWNER_PROFILE_UPDATED",
  "DISCOVERY_ONBOARDING_STARTED",
]);

export async function trackMarketplaceEvent(input: {
  eventType: string;
  userId?: string | null;
  studioId?: string | null;
  bookingId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
}) {
  if (!ALLOWED_EVENTS.has(input.eventType)) return;
  await db.marketplaceEvent.create({
    data: {
      eventType: input.eventType,
      userId: input.userId || null,
      studioId: input.studioId || null,
      bookingId: input.bookingId || null,
      metadata: input.metadata || undefined,
    },
  }).catch(() => undefined);
}
