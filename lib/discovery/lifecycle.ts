import {
  CandidateStudioStatus,
  CandidateStudioTransitionActor,
  DiscoveryStudioCategory,
  Prisma,
} from "@prisma/client";

import { db } from "@/lib/db";

const STATUS_GRAPH: Record<CandidateStudioStatus, readonly CandidateStudioStatus[]> = {
  [CandidateStudioStatus.DISCOVERED]: [
    CandidateStudioStatus.ENRICHED,
    CandidateStudioStatus.REVIEW_REQUIRED,
    CandidateStudioStatus.REJECTED,
    CandidateStudioStatus.ARCHIVED,
  ],
  [CandidateStudioStatus.ENRICHED]: [
    CandidateStudioStatus.REVIEW_REQUIRED,
    CandidateStudioStatus.APPROVED,
    CandidateStudioStatus.REJECTED,
    CandidateStudioStatus.ARCHIVED,
  ],
  [CandidateStudioStatus.REVIEW_REQUIRED]: [
    CandidateStudioStatus.ENRICHED,
    CandidateStudioStatus.APPROVED,
    CandidateStudioStatus.REJECTED,
    CandidateStudioStatus.ARCHIVED,
  ],
  [CandidateStudioStatus.APPROVED]: [
    CandidateStudioStatus.REVIEW_REQUIRED,
    CandidateStudioStatus.ARCHIVED,
    CandidateStudioStatus.CONVERTED,
  ],
  [CandidateStudioStatus.REJECTED]: [
    CandidateStudioStatus.REVIEW_REQUIRED,
  ],
  [CandidateStudioStatus.ARCHIVED]: [
    CandidateStudioStatus.REVIEW_REQUIRED,
  ],
  [CandidateStudioStatus.CONVERTED]: [],
};

const SYSTEM_ALLOWED: Record<CandidateStudioStatus, readonly CandidateStudioStatus[]> = {
  [CandidateStudioStatus.DISCOVERED]: [
    CandidateStudioStatus.ENRICHED,
    CandidateStudioStatus.REVIEW_REQUIRED,
    CandidateStudioStatus.ARCHIVED,
  ],
  [CandidateStudioStatus.ENRICHED]: [
    CandidateStudioStatus.REVIEW_REQUIRED,
    CandidateStudioStatus.ARCHIVED,
  ],
  [CandidateStudioStatus.REVIEW_REQUIRED]: [],
  [CandidateStudioStatus.APPROVED]: [
    CandidateStudioStatus.REVIEW_REQUIRED,
    CandidateStudioStatus.ARCHIVED,
    CandidateStudioStatus.CONVERTED,
  ],
  [CandidateStudioStatus.REJECTED]: [
    CandidateStudioStatus.REVIEW_REQUIRED,
  ],
  [CandidateStudioStatus.ARCHIVED]: [
    CandidateStudioStatus.REVIEW_REQUIRED,
  ],
  [CandidateStudioStatus.CONVERTED]: [],
};

export type CandidateTransitionInput = {
  candidateId: string;
  toStatus: CandidateStudioStatus;
  actor: CandidateStudioTransitionActor;
  actorUserId?: string | null;
  reasonCode: string;
  note?: string;
  metadata?: Prisma.InputJsonValue;
  convertedStudioId?: string | null;
};

export function canTransitionCandidateStatus(
  fromStatus: CandidateStudioStatus,
  toStatus: CandidateStudioStatus,
) {
  return STATUS_GRAPH[fromStatus].includes(toStatus);
}

export function canActorTransitionCandidateStatus(
  actor: CandidateStudioTransitionActor,
  fromStatus: CandidateStudioStatus,
  toStatus: CandidateStudioStatus,
) {
  if (!canTransitionCandidateStatus(fromStatus, toStatus)) return false;
  if (actor === CandidateStudioTransitionActor.ADMIN) return true;
  return SYSTEM_ALLOWED[fromStatus].includes(toStatus);
}

function normalizeReasonCode(value: string) {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_.:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  if (!normalized) throw new Error("CANDIDATE_TRANSITION_REASON_REQUIRED");
  return normalized;
}

function assertCandidateDataQuality(candidate: {
  name: string;
  normalizedName: string;
  category: DiscoveryStudioCategory;
  countryCode: string | null;
  city: string | null;
  address: string | null;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  sources: Array<{ id: string }>;
}) {
  if (candidate.name.trim().length < 2 || candidate.normalizedName.trim().length < 2) {
    throw new Error("CANDIDATE_IDENTITY_INCOMPLETE");
  }
  if (candidate.category === DiscoveryStudioCategory.OTHER) {
    throw new Error("CANDIDATE_CATEGORY_UNRESOLVED");
  }
  if (!candidate.countryCode || candidate.countryCode.length !== 2) {
    throw new Error("CANDIDATE_COUNTRY_UNRESOLVED");
  }

  const hasCoordinates = candidate.latitude != null && candidate.longitude != null;
  const hasReadableLocation = Boolean(candidate.city?.trim() || candidate.address?.trim());
  if (!hasCoordinates && !hasReadableLocation) {
    throw new Error("CANDIDATE_LOCATION_INCOMPLETE");
  }
  if (candidate.sources.length === 0) {
    throw new Error("CANDIDATE_SOURCE_REQUIRED");
  }
}

export async function transitionCandidateStudio(input: CandidateTransitionInput) {
  const reasonCode = normalizeReasonCode(input.reasonCode);
  const note = (input.note || "").trim().slice(0, 2000);

  return db.$transaction(async (tx) => {
    const candidate = await tx.candidateStudio.findUnique({
      where: { id: input.candidateId },
      include: {
        sources: {
          where: { active: true },
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!candidate) throw new Error("CANDIDATE_NOT_FOUND");

    if (!canActorTransitionCandidateStatus(input.actor, candidate.status, input.toStatus)) {
      throw new Error(
        `CANDIDATE_TRANSITION_NOT_ALLOWED:${candidate.status}->${input.toStatus}:${input.actor}`,
      );
    }

    if (input.actor === CandidateStudioTransitionActor.ADMIN) {
      if (!input.actorUserId) throw new Error("CANDIDATE_ADMIN_ACTOR_REQUIRED");
      const admin = await tx.user.findUnique({
        where: { id: input.actorUserId },
        select: { role: true, status: true },
      });
      if (!admin || admin.role !== "ADMIN" || admin.status !== "ACTIVE") {
        throw new Error("CANDIDATE_ADMIN_ACTOR_INVALID");
      }
    } else if (input.actorUserId) {
      throw new Error("CANDIDATE_SYSTEM_ACTOR_CANNOT_HAVE_USER");
    }

    if (
      input.toStatus === CandidateStudioStatus.ENRICHED ||
      input.toStatus === CandidateStudioStatus.APPROVED
    ) {
      assertCandidateDataQuality(candidate);
    }

    let conversionStudioId: string | null = null;

    if (input.toStatus === CandidateStudioStatus.CONVERTED) {
      if (!input.convertedStudioId) throw new Error("CANDIDATE_CONVERSION_STUDIO_REQUIRED");
      const studio = await tx.studio.findUnique({
        where: { id: input.convertedStudioId },
        select: { id: true },
      });
      if (!studio) throw new Error("CANDIDATE_CONVERSION_STUDIO_NOT_FOUND");
      conversionStudioId = studio.id;
    } else if (input.convertedStudioId) {
      throw new Error("CANDIDATE_CONVERSION_STUDIO_ONLY_FOR_CONVERTED");
    }

    const updated = await tx.candidateStudio.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
      },
      data: input.toStatus === CandidateStudioStatus.CONVERTED
        ? {
            status: input.toStatus,
            convertedStudioId: conversionStudioId!,
            convertedAt: new Date(),
          }
        : {
            status: input.toStatus,
          },
    });

    if (updated.count !== 1) {
      throw new Error("CANDIDATE_TRANSITION_CONCURRENT_UPDATE");
    }

    const transition = await tx.candidateStudioTransition.create({
      data: {
        candidateStudioId: candidate.id,
        fromStatus: candidate.status,
        toStatus: input.toStatus,
        actor: input.actor,
        actorUserId: input.actor === CandidateStudioTransitionActor.ADMIN
          ? input.actorUserId!
          : null,
        reasonCode,
        note,
        metadata: input.metadata,
      },
      select: {
        id: true,
        createdAt: true,
      },
    });

    return {
      candidateId: candidate.id,
      fromStatus: candidate.status,
      toStatus: input.toStatus,
      transitionId: transition.id,
      transitionedAt: transition.createdAt,
    };
  }, { isolationLevel: "Serializable" });
}
