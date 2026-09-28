CREATE TYPE "PayoutStatus" AS ENUM ('PENDING','ELIGIBLE','PAID','HOLD');
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP','EMAIL','WHATSAPP');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('QUEUED','SENT','FAILED','SKIPPED');

ALTER TABLE "Studio"
  ADD COLUMN "commissionBps" INTEGER NOT NULL DEFAULT 1200,
  ADD CONSTRAINT "Studio_commissionBps_range" CHECK ("commissionBps" BETWEEN 0 AND 5000);

ALTER TABLE "Booking"
  ADD COLUMN "commissionBps" INTEGER NOT NULL DEFAULT 1200,
  ADD COLUMN "commissionAmountMad" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "studioNetAmountMad" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "Booking_financials_nonnegative" CHECK ("commissionBps" BETWEEN 0 AND 5000 AND "commissionAmountMad" >= 0 AND "studioNetAmountMad" >= 0);

CREATE TABLE "Favorite" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "studioId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Favorite_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "StudioAddon" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "studioId" UUID NOT NULL,
  "roomId" UUID,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "unitPriceMad" INTEGER NOT NULL,
  "unitLabel" TEXT NOT NULL DEFAULT 'item',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioAddon_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StudioAddon_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudioAddon_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StudioAddon_price_positive" CHECK ("unitPriceMad" > 0)
);

CREATE TABLE "BookingAddon" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "addonId" UUID,
  "nameSnapshot" TEXT NOT NULL,
  "unitPriceMad" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "totalMad" INTEGER NOT NULL,
  CONSTRAINT "BookingAddon_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingAddon_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BookingAddon_addonId_fkey" FOREIGN KEY ("addonId") REFERENCES "StudioAddon"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "BookingAddon_positive" CHECK ("unitPriceMad" > 0 AND "quantity" > 0 AND "totalMad" >= 0)
);

CREATE TABLE "Notification" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL DEFAULT '',
  "href" TEXT NOT NULL DEFAULT '',
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "NotificationDelivery" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "notificationId" UUID NOT NULL,
  "channel" "NotificationChannel" NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'QUEUED',
  "provider" TEXT NOT NULL DEFAULT '',
  "providerRef" TEXT NOT NULL DEFAULT '',
  "error" TEXT NOT NULL DEFAULT '',
  "sentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "NotificationDelivery_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "Notification"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Payout" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bookingId" UUID NOT NULL,
  "studioId" UUID NOT NULL,
  "grossAmountMad" INTEGER NOT NULL,
  "commissionBps" INTEGER NOT NULL,
  "commissionAmountMad" INTEGER NOT NULL,
  "netAmountMad" INTEGER NOT NULL,
  "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
  "availableAt" TIMESTAMP(3),
  "paidAt" TIMESTAMP(3),
  "reference" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Payout_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Payout_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Payout_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Payout_amounts_nonnegative" CHECK ("grossAmountMad" >= 0 AND "commissionAmountMad" >= 0 AND "netAmountMad" >= 0),
  CONSTRAINT "Payout_commission_range" CHECK ("commissionBps" BETWEEN 0 AND 5000)
);

CREATE TABLE "MarketplaceEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "eventType" TEXT NOT NULL,
  "userId" UUID,
  "studioId" UUID,
  "bookingId" UUID,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarketplaceEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MarketplaceEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MarketplaceEvent_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MarketplaceEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Favorite_userId_studioId_key" ON "Favorite"("userId","studioId");
CREATE INDEX "Favorite_studioId_idx" ON "Favorite"("studioId");
CREATE INDEX "StudioAddon_studioId_active_idx" ON "StudioAddon"("studioId","active");
CREATE INDEX "StudioAddon_roomId_active_idx" ON "StudioAddon"("roomId","active");
CREATE INDEX "BookingAddon_bookingId_idx" ON "BookingAddon"("bookingId");
CREATE INDEX "BookingAddon_addonId_idx" ON "BookingAddon"("addonId");
CREATE INDEX "Notification_userId_createdAt_idx" ON "Notification"("userId","createdAt");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId","readAt");
CREATE INDEX "NotificationDelivery_notificationId_idx" ON "NotificationDelivery"("notificationId");
CREATE INDEX "NotificationDelivery_status_channel_idx" ON "NotificationDelivery"("status","channel");
CREATE UNIQUE INDEX "Payout_bookingId_key" ON "Payout"("bookingId");
CREATE INDEX "Payout_studioId_status_idx" ON "Payout"("studioId","status");
CREATE INDEX "MarketplaceEvent_eventType_createdAt_idx" ON "MarketplaceEvent"("eventType","createdAt");
CREATE INDEX "MarketplaceEvent_studioId_createdAt_idx" ON "MarketplaceEvent"("studioId","createdAt");
CREATE INDEX "MarketplaceEvent_userId_createdAt_idx" ON "MarketplaceEvent"("userId","createdAt");
