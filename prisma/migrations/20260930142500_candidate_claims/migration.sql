CREATE TYPE "CandidateStudioClaimStatus" AS ENUM (
  'SUBMITTED',
  'VERIFIED',
  'REJECTED',
  'WITHDRAWN'
);

CREATE TYPE "CandidateStudioClaimRelationship" AS ENUM (
  'OWNER',
  'MANAGER',
  'AUTHORIZED_REPRESENTATIVE'
);

CREATE TABLE "CandidateStudioClaim" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "candidateStudioId" UUID NOT NULL,
  "claimantId" UUID NOT NULL,
  "relationship" "CandidateStudioClaimRelationship" NOT NULL,
  "businessEmail" TEXT NOT NULL,
  "businessPhone" TEXT NOT NULL DEFAULT '',
  "proofUrl" TEXT NOT NULL DEFAULT '',
  "evidenceNote" TEXT NOT NULL DEFAULT '',
  "status" "CandidateStudioClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
  "reviewedById" UUID,
  "adminNote" TEXT NOT NULL DEFAULT '',
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateStudioClaim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CandidateStudioClaim_businessEmail_required"
    CHECK (char_length(trim("businessEmail")) >= 3),
  CONSTRAINT "CandidateStudioClaim_review_consistent"
    CHECK (
      ("status" IN ('VERIFIED','REJECTED') AND "reviewedById" IS NOT NULL AND "reviewedAt" IS NOT NULL)
      OR
      ("status" IN ('SUBMITTED','WITHDRAWN') AND "reviewedById" IS NULL AND "reviewedAt" IS NULL)
    )
);

CREATE UNIQUE INDEX "CandidateStudioClaim_candidateStudioId_claimantId_key"
  ON "CandidateStudioClaim"("candidateStudioId", "claimantId");

CREATE UNIQUE INDEX "CandidateStudioClaim_one_verified_per_candidate_key"
  ON "CandidateStudioClaim"("candidateStudioId")
  WHERE "status" = 'VERIFIED';

CREATE INDEX "CandidateStudioClaim_candidateStudioId_status_createdAt_idx"
  ON "CandidateStudioClaim"("candidateStudioId", "status", "createdAt");

CREATE INDEX "CandidateStudioClaim_claimantId_status_createdAt_idx"
  ON "CandidateStudioClaim"("claimantId", "status", "createdAt");

CREATE INDEX "CandidateStudioClaim_reviewedById_reviewedAt_idx"
  ON "CandidateStudioClaim"("reviewedById", "reviewedAt");

ALTER TABLE "CandidateStudioClaim"
  ADD CONSTRAINT "CandidateStudioClaim_candidateStudioId_fkey"
  FOREIGN KEY ("candidateStudioId") REFERENCES "CandidateStudio"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CandidateStudioClaim"
  ADD CONSTRAINT "CandidateStudioClaim_claimantId_fkey"
  FOREIGN KEY ("claimantId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CandidateStudioClaim"
  ADD CONSTRAINT "CandidateStudioClaim_reviewedById_fkey"
  FOREIGN KEY ("reviewedById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
