CREATE TYPE "CandidateStudioStatus" AS ENUM (
  'DISCOVERED',
  'ENRICHED',
  'REVIEW_REQUIRED',
  'APPROVED',
  'REJECTED',
  'ARCHIVED',
  'CONVERTED'
);

CREATE TYPE "DiscoveryStudioCategory" AS ENUM (
  'RECORDING',
  'PODCAST',
  'PHOTO',
  'VIDEO',
  'REHEARSAL',
  'DJ',
  'PRODUCTION',
  'VOICE_OVER',
  'LIVE_STREAMING',
  'POST_PRODUCTION',
  'OTHER'
);

CREATE TABLE "CandidateStudio" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "category" "DiscoveryStudioCategory" NOT NULL DEFAULT 'OTHER',
  "status" "CandidateStudioStatus" NOT NULL DEFAULT 'DISCOVERED',
  "countryCode" VARCHAR(2),
  "country" TEXT,
  "region" TEXT,
  "city" TEXT,
  "district" TEXT,
  "postalCode" TEXT,
  "address" TEXT,
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(9,6),
  "phone" TEXT,
  "email" TEXT,
  "website" TEXT,
  "instagram" TEXT,
  "convertedStudioId" UUID,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastCheckedAt" TIMESTAMP(3),
  "convertedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateStudio_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CandidateStudio_coordinates_valid" CHECK (
    ("latitude" IS NULL OR ("latitude" BETWEEN -90 AND 90)) AND
    ("longitude" IS NULL OR ("longitude" BETWEEN -180 AND 180))
  ),
  CONSTRAINT "CandidateStudio_countryCode_valid" CHECK (
    "countryCode" IS NULL OR (
      char_length("countryCode") = 2 AND "countryCode" = upper("countryCode")
    )
  ),
  CONSTRAINT "CandidateStudio_conversion_consistent" CHECK (
    ("status" <> 'CONVERTED' AND "convertedStudioId" IS NULL AND "convertedAt" IS NULL)
    OR
    ("status" = 'CONVERTED' AND "convertedAt" IS NOT NULL)
  )
);

CREATE TABLE "CandidateStudioSource" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "candidateStudioId" UUID NOT NULL,
  "provider" TEXT NOT NULL,
  "sourceKey" TEXT NOT NULL,
  "externalId" TEXT,
  "sourceUrl" TEXT,
  "providerCategory" TEXT,
  "attribution" TEXT,
  "licenseUrl" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastCheckedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateStudioSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CandidateStudio_slug_key"
  ON "CandidateStudio"("slug");

CREATE UNIQUE INDEX "CandidateStudio_convertedStudioId_key"
  ON "CandidateStudio"("convertedStudioId");

CREATE INDEX "CandidateStudio_normalizedName_idx"
  ON "CandidateStudio"("normalizedName");

CREATE INDEX "CandidateStudio_status_countryCode_city_idx"
  ON "CandidateStudio"("status", "countryCode", "city");

CREATE INDEX "CandidateStudio_category_status_idx"
  ON "CandidateStudio"("category", "status");

CREATE UNIQUE INDEX "CandidateStudioSource_provider_sourceKey_key"
  ON "CandidateStudioSource"("provider", "sourceKey");

CREATE INDEX "CandidateStudioSource_candidateStudioId_idx"
  ON "CandidateStudioSource"("candidateStudioId");

CREATE INDEX "CandidateStudioSource_provider_externalId_idx"
  ON "CandidateStudioSource"("provider", "externalId");

ALTER TABLE "CandidateStudio"
  ADD CONSTRAINT "CandidateStudio_convertedStudioId_fkey"
  FOREIGN KEY ("convertedStudioId") REFERENCES "Studio"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CandidateStudioSource"
  ADD CONSTRAINT "CandidateStudioSource_candidateStudioId_fkey"
  FOREIGN KEY ("candidateStudioId") REFERENCES "CandidateStudio"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
