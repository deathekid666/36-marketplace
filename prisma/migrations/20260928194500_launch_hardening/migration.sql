CREATE TYPE "DisputeStatus" AS ENUM ('OPEN','UNDER_REVIEW','RESOLVED','REJECTED');
CREATE TYPE "PromoDiscountType" AS ENUM ('PERCENT','FIXED_MAD');
CREATE TYPE "ReferralStatus" AS ENUM ('PENDING','QUALIFIED','REWARDED','CANCELLED');
CREATE TYPE "InvoiceStatus" AS ENUM ('ISSUED','VOID');

ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

ALTER TABLE "Studio"
  ADD COLUMN "legalName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "taxId" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "ice" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "taxRateBps" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "Studio_taxRateBps_range" CHECK ("taxRateBps" BETWEEN 0 AND 3000);

ALTER TABLE "Booking"
  ADD COLUMN "promoDiscountMad" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxBps" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmountMad" INTEGER NOT NULL DEFAULT 0,
  ADD CONSTRAINT "Booking_tax_promo_nonnegative" CHECK ("promoDiscountMad" >= 0 AND "taxBps" BETWEEN 0 AND 3000 AND "taxAmountMad" >= 0);

CREATE TABLE "EmailVerificationToken" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "userId" UUID NOT NULL, "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "PasswordResetToken" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "userId" UUID NOT NULL, "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL, "usedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "RateLimitWindow" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "keyHash" TEXT NOT NULL, "action" TEXT NOT NULL,
  "windowStart" TIMESTAMP(3) NOT NULL, "count" INTEGER NOT NULL DEFAULT 1, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RateLimitWindow_pkey" PRIMARY KEY ("id"), CONSTRAINT "RateLimitWindow_count_positive" CHECK ("count" > 0)
);
CREATE TABLE "StoredFile" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "ownerId" UUID NOT NULL, "studioId" UUID,
  "kind" TEXT NOT NULL, "provider" TEXT NOT NULL, "storageKey" TEXT NOT NULL, "url" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL, "sizeBytes" BIGINT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StoredFile_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StoredFile_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "StoredFile_size_nonnegative" CHECK ("sizeBytes" >= 0)
);
CREATE TABLE "BookingReminder" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "bookingId" UUID NOT NULL, "kind" TEXT NOT NULL,
  "sendAt" TIMESTAMP(3) NOT NULL, "sentAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BookingReminder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BookingReminder_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "Dispute" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "bookingId" UUID NOT NULL, "openedById" UUID NOT NULL,
  "assignedAdminId" UUID, "status" "DisputeStatus" NOT NULL DEFAULT 'OPEN', "reason" TEXT NOT NULL,
  "details" TEXT NOT NULL DEFAULT '', "resolution" TEXT NOT NULL DEFAULT '', "refundAmountMad" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3), CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Dispute_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Dispute_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Dispute_assignedAdminId_fkey" FOREIGN KEY ("assignedAdminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "Dispute_refund_nonnegative" CHECK ("refundAmountMad" >= 0)
);
CREATE TABLE "PromoCode" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "code" TEXT NOT NULL, "discountType" "PromoDiscountType" NOT NULL,
  "amount" INTEGER NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, "startsAt" TIMESTAMP(3), "endsAt" TIMESTAMP(3),
  "maxUses" INTEGER, "perUserLimit" INTEGER NOT NULL DEFAULT 1, "minBookingMad" INTEGER NOT NULL DEFAULT 0,
  "studioId" UUID, "createdById" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PromoCode_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PromoCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PromoCode_amount_positive" CHECK ("amount" > 0),
  CONSTRAINT "PromoCode_limits_valid" CHECK (("maxUses" IS NULL OR "maxUses" > 0) AND "perUserLimit" > 0 AND "minBookingMad" >= 0)
);
CREATE TABLE "PromoRedemption" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "promoId" UUID NOT NULL, "userId" UUID NOT NULL,
  "bookingId" UUID NOT NULL, "discountMad" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromoRedemption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PromoRedemption_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PromoRedemption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PromoRedemption_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PromoRedemption_discount_nonnegative" CHECK ("discountMad" >= 0)
);
CREATE TABLE "Referral" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "inviterId" UUID NOT NULL, "inviteeId" UUID NOT NULL, "code" TEXT NOT NULL,
  "status" "ReferralStatus" NOT NULL DEFAULT 'PENDING', "rewardMad" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "qualifiedAt" TIMESTAMP(3), "rewardedAt" TIMESTAMP(3),
  CONSTRAINT "Referral_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Referral_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Referral_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Referral_reward_nonnegative" CHECK ("rewardMad" >= 0), CONSTRAINT "Referral_different_users" CHECK ("inviterId" <> "inviteeId")
);
CREATE TABLE "Invoice" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(), "bookingId" UUID NOT NULL, "number" TEXT NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED', "sellerName" TEXT NOT NULL, "sellerTaxId" TEXT NOT NULL DEFAULT '',
  "sellerIce" TEXT NOT NULL DEFAULT '', "buyerName" TEXT NOT NULL, "buyerEmail" TEXT NOT NULL,
  "subtotalMad" INTEGER NOT NULL, "discountMad" INTEGER NOT NULL DEFAULT 0, "taxBps" INTEGER NOT NULL DEFAULT 0,
  "taxAmountMad" INTEGER NOT NULL DEFAULT 0, "totalMad" INTEGER NOT NULL, "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Invoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Invoice_amounts_nonnegative" CHECK ("subtotalMad" >= 0 AND "discountMad" >= 0 AND "taxBps" BETWEEN 0 AND 3000 AND "taxAmountMad" >= 0 AND "totalMad" >= 0)
);

CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
CREATE INDEX "EmailVerificationToken_userId_expiresAt_idx" ON "EmailVerificationToken"("userId","expiresAt");
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
CREATE INDEX "PasswordResetToken_userId_expiresAt_idx" ON "PasswordResetToken"("userId","expiresAt");
CREATE UNIQUE INDEX "RateLimitWindow_keyHash_action_windowStart_key" ON "RateLimitWindow"("keyHash","action","windowStart");
CREATE INDEX "RateLimitWindow_updatedAt_idx" ON "RateLimitWindow"("updatedAt");
CREATE UNIQUE INDEX "StoredFile_storageKey_key" ON "StoredFile"("storageKey");
CREATE INDEX "StoredFile_ownerId_createdAt_idx" ON "StoredFile"("ownerId","createdAt");
CREATE INDEX "StoredFile_studioId_createdAt_idx" ON "StoredFile"("studioId","createdAt");
CREATE UNIQUE INDEX "BookingReminder_bookingId_kind_key" ON "BookingReminder"("bookingId","kind");
CREATE INDEX "BookingReminder_sendAt_sentAt_idx" ON "BookingReminder"("sendAt","sentAt");
CREATE UNIQUE INDEX "Dispute_bookingId_key" ON "Dispute"("bookingId");
CREATE INDEX "Dispute_status_createdAt_idx" ON "Dispute"("status","createdAt");
CREATE INDEX "Dispute_assignedAdminId_idx" ON "Dispute"("assignedAdminId");
CREATE UNIQUE INDEX "PromoCode_code_key" ON "PromoCode"("code");
CREATE INDEX "PromoCode_studioId_active_idx" ON "PromoCode"("studioId","active");
CREATE INDEX "PromoCode_active_endsAt_idx" ON "PromoCode"("active","endsAt");
CREATE UNIQUE INDEX "PromoRedemption_bookingId_key" ON "PromoRedemption"("bookingId");
CREATE INDEX "PromoRedemption_promoId_idx" ON "PromoRedemption"("promoId");
CREATE INDEX "PromoRedemption_userId_idx" ON "PromoRedemption"("userId");
CREATE UNIQUE INDEX "Referral_inviteeId_key" ON "Referral"("inviteeId");
CREATE UNIQUE INDEX "Referral_code_inviteeId_key" ON "Referral"("code","inviteeId");
CREATE INDEX "Referral_inviterId_status_idx" ON "Referral"("inviterId","status");
CREATE UNIQUE INDEX "Invoice_bookingId_key" ON "Invoice"("bookingId");
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

ALTER TABLE "StoredFile" ADD COLUMN "bookingId" UUID;
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "StoredFile_bookingId_createdAt_idx" ON "StoredFile"("bookingId","createdAt");
