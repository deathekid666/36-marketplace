CREATE TYPE "StudioStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'VERIFIED', 'REJECTED', 'SUSPENDED');
CREATE TYPE "StudioCategory" AS ENUM ('RECORDING', 'PODCAST', 'PHOTO', 'VIDEO', 'REHEARSAL', 'DJ', 'PRODUCTION');

CREATE TABLE "Studio" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "ownerId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "primaryCategory" "StudioCategory" NOT NULL DEFAULT 'RECORDING',
  "city" TEXT NOT NULL DEFAULT 'Casablanca',
  "neighborhood" TEXT NOT NULL DEFAULT '',
  "address" TEXT NOT NULL DEFAULT '',
  "latitude" DECIMAL(9,6),
  "longitude" DECIMAL(9,6),
  "phone" TEXT NOT NULL DEFAULT '',
  "instagram" TEXT NOT NULL DEFAULT '',
  "website" TEXT NOT NULL DEFAULT '',
  "status" "StudioStatus" NOT NULL DEFAULT 'DRAFT',
  "submittedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "verificationNote" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Studio_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioPhoto" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "studioId" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "alt" TEXT NOT NULL DEFAULT '',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudioPhoto_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioAmenity" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "studioId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  CONSTRAINT "StudioAmenity_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Room" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "studioId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "category" "StudioCategory" NOT NULL DEFAULT 'RECORDING',
  "hourlyRateMad" INTEGER NOT NULL,
  "minimumHours" INTEGER NOT NULL DEFAULT 1,
  "capacity" INTEGER NOT NULL DEFAULT 1,
  "engineerIncluded" BOOLEAN NOT NULL DEFAULT false,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RoomEquipment" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "roomId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  CONSTRAINT "RoomEquipment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OpeningHour" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "studioId" UUID NOT NULL,
  "dayOfWeek" INTEGER NOT NULL,
  "opensAt" TEXT NOT NULL DEFAULT '09:00',
  "closesAt" TEXT NOT NULL DEFAULT '22:00',
  "closed" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "OpeningHour_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BlockedSlot" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "roomId" UUID NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BlockedSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Studio_slug_key" ON "Studio"("slug");
CREATE INDEX "Studio_ownerId_idx" ON "Studio"("ownerId");
CREATE INDEX "Studio_city_status_idx" ON "Studio"("city", "status");
CREATE INDEX "Studio_status_idx" ON "Studio"("status");
CREATE INDEX "StudioPhoto_studioId_sortOrder_idx" ON "StudioPhoto"("studioId", "sortOrder");
CREATE UNIQUE INDEX "StudioAmenity_studioId_name_key" ON "StudioAmenity"("studioId", "name");
CREATE INDEX "StudioAmenity_studioId_idx" ON "StudioAmenity"("studioId");
CREATE INDEX "Room_studioId_idx" ON "Room"("studioId");
CREATE INDEX "Room_category_active_idx" ON "Room"("category", "active");
CREATE UNIQUE INDEX "RoomEquipment_roomId_name_key" ON "RoomEquipment"("roomId", "name");
CREATE INDEX "RoomEquipment_roomId_idx" ON "RoomEquipment"("roomId");
CREATE UNIQUE INDEX "OpeningHour_studioId_dayOfWeek_key" ON "OpeningHour"("studioId", "dayOfWeek");
CREATE INDEX "OpeningHour_studioId_idx" ON "OpeningHour"("studioId");
CREATE INDEX "BlockedSlot_roomId_startAt_endAt_idx" ON "BlockedSlot"("roomId", "startAt", "endAt");

ALTER TABLE "Studio" ADD CONSTRAINT "Studio_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioPhoto" ADD CONSTRAINT "StudioPhoto_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioAmenity" ADD CONSTRAINT "StudioAmenity_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RoomEquipment" ADD CONSTRAINT "RoomEquipment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OpeningHour" ADD CONSTRAINT "OpeningHour_studioId_fkey" FOREIGN KEY ("studioId") REFERENCES "Studio"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BlockedSlot" ADD CONSTRAINT "BlockedSlot_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Room" ADD CONSTRAINT "Room_hourlyRateMad_positive" CHECK ("hourlyRateMad" > 0);
ALTER TABLE "Room" ADD CONSTRAINT "Room_minimumHours_positive" CHECK ("minimumHours" > 0);
ALTER TABLE "Room" ADD CONSTRAINT "Room_capacity_positive" CHECK ("capacity" > 0);
ALTER TABLE "OpeningHour" ADD CONSTRAINT "OpeningHour_day_range" CHECK ("dayOfWeek" BETWEEN 0 AND 6);
ALTER TABLE "BlockedSlot" ADD CONSTRAINT "BlockedSlot_time_order" CHECK ("endAt" > "startAt");
