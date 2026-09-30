CREATE TYPE "CandidateStudioTransitionActor" AS ENUM ('SYSTEM', 'ADMIN');

CREATE TABLE "CandidateStudioTransition" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "candidateStudioId" UUID NOT NULL,
  "fromStatus" "CandidateStudioStatus",
  "toStatus" "CandidateStudioStatus" NOT NULL,
  "actor" "CandidateStudioTransitionActor" NOT NULL DEFAULT 'SYSTEM',
  "actorUserId" UUID,
  "reasonCode" TEXT NOT NULL,
  "note" TEXT NOT NULL DEFAULT '',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CandidateStudioTransition_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CandidateStudioTransition_actor_consistent" CHECK (
    ("actor" = 'SYSTEM' AND "actorUserId" IS NULL)
    OR
    ("actor" = 'ADMIN' AND "actorUserId" IS NOT NULL)
  ),
  CONSTRAINT "CandidateStudioTransition_reason_required" CHECK (char_length(trim("reasonCode")) > 0)
);

CREATE INDEX "CandidateStudioTransition_candidateStudioId_createdAt_idx"
  ON "CandidateStudioTransition"("candidateStudioId", "createdAt");

CREATE INDEX "CandidateStudioTransition_actorUserId_createdAt_idx"
  ON "CandidateStudioTransition"("actorUserId", "createdAt");

CREATE INDEX "CandidateStudioTransition_toStatus_createdAt_idx"
  ON "CandidateStudioTransition"("toStatus", "createdAt");

ALTER TABLE "CandidateStudioTransition"
  ADD CONSTRAINT "CandidateStudioTransition_candidateStudioId_fkey"
  FOREIGN KEY ("candidateStudioId") REFERENCES "CandidateStudio"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CandidateStudioTransition"
  ADD CONSTRAINT "CandidateStudioTransition_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
