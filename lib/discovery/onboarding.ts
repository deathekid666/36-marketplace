import {
  CandidateStudioStatus,
  CandidateStudioTransitionActor,
  DiscoveryStudioCategory,
  StudioCategory,
} from "@prisma/client";

import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";
import { trackMarketplaceEvent } from "@/lib/analytics";
import { isDiscoveryRolloutEnabled } from "@/lib/discovery/rollout";

function studioCategory(value: DiscoveryStudioCategory): StudioCategory {
  switch (value) {
    case DiscoveryStudioCategory.RECORDING:
    case DiscoveryStudioCategory.VOICE_OVER:
      return StudioCategory.RECORDING;
    case DiscoveryStudioCategory.PODCAST:
      return StudioCategory.PODCAST;
    case DiscoveryStudioCategory.PHOTO:
      return StudioCategory.PHOTO;
    case DiscoveryStudioCategory.VIDEO:
    case DiscoveryStudioCategory.LIVE_STREAMING:
      return StudioCategory.VIDEO;
    case DiscoveryStudioCategory.REHEARSAL:
      return StudioCategory.REHEARSAL;
    case DiscoveryStudioCategory.DJ:
      return StudioCategory.DJ;
    case DiscoveryStudioCategory.PRODUCTION:
    case DiscoveryStudioCategory.POST_PRODUCTION:
      return StudioCategory.PRODUCTION;
    case DiscoveryStudioCategory.OTHER:
      throw new Error("ONBOARDING_CATEGORY_UNRESOLVED");
  }
}

function studioSlug(candidateSlug: string, claimId: string) {
  const base = candidateSlug
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "studio";
  return `${base}-36-${claimId.replaceAll("-", "").slice(0, 8)}`;
}

export async function startClaimedStudioOnboarding(input: {
  claimId: string;
  claimantId: string;
}) {
  const result = await db.$transaction(
    async (tx) => {
      const claimant = await tx.user.findUnique({
        where: { id: input.claimantId },
        select: {
          id: true,
          role: true,
          status: true,
          emailVerifiedAt: true,
        },
      });

      if (!claimant || claimant.role !== "STUDIO_OWNER" || claimant.status !== "ACTIVE") {
        throw new Error("ONBOARDING_OWNER_INVALID");
      }
      if (!claimant.emailVerifiedAt) throw new Error("ONBOARDING_EMAIL_VERIFICATION_REQUIRED");

      const claim = await tx.candidateStudioClaim.findFirst({
        where: {
          id: input.claimId,
          claimantId: claimant.id,
        },
        include: {
          candidateStudio: {
            include: {
              convertedStudio: {
                select: { id: true, ownerId: true },
              },
            },
          },
        },
      });

      if (!claim) throw new Error("ONBOARDING_CLAIM_NOT_FOUND");
      if (claim.status !== "VERIFIED") throw new Error("ONBOARDING_CLAIM_NOT_VERIFIED");

      const candidate = claim.candidateStudio;

      if (candidate.convertedStudio) {
        if (candidate.convertedStudio.ownerId !== claimant.id) {
          throw new Error("ONBOARDING_ALREADY_CONVERTED");
        }
        return {
          studioId: candidate.convertedStudio.id,
          candidateId: candidate.id,
          alreadyConverted: true,
        };
      }

      if (candidate.status !== CandidateStudioStatus.APPROVED) {
        throw new Error("ONBOARDING_CANDIDATE_NOT_APPROVED");
      }

      // Conversion is allow-listed by D14 rollout scope. The current booking
      // engine remains Morocco/Casablanca-time and MAD-based.
      if (!isDiscoveryRolloutEnabled(candidate, "ONBOARDING")) {
        throw new Error("ONBOARDING_MARKET_NOT_SUPPORTED");
      }

      const createdStudio = await tx.studio.create({
        data: {
          ownerId: claimant.id,
          name: candidate.name,
          slug: studioSlug(candidate.slug, claim.id),
          description: "",
          primaryCategory: studioCategory(candidate.category),
          city: candidate.city || "Casablanca",
          neighborhood: candidate.district || "",
          address: candidate.address || "",
          latitude: candidate.latitude,
          longitude: candidate.longitude,
          phone: candidate.phone || claim.businessPhone || "",
          instagram: candidate.instagram || "",
          website: candidate.website || claim.proofUrl || "",
          status: "DRAFT",
        },
        select: {
          id: true,
          name: true,
          slug: true,
        },
      });

      const updated = await tx.candidateStudio.updateMany({
        where: {
          id: candidate.id,
          status: CandidateStudioStatus.APPROVED,
          convertedStudioId: null,
        },
        data: {
          status: CandidateStudioStatus.CONVERTED,
          convertedStudioId: createdStudio.id,
          convertedAt: new Date(),
        },
      });

      if (updated.count !== 1) {
        throw new Error("ONBOARDING_CONCURRENT_CONVERSION");
      }

      await tx.candidateStudioTransition.create({
        data: {
          candidateStudioId: candidate.id,
          fromStatus: CandidateStudioStatus.APPROVED,
          toStatus: CandidateStudioStatus.CONVERTED,
          actor: CandidateStudioTransitionActor.SYSTEM,
          reasonCode: "VERIFIED_CLAIM_CONVERSION",
          note: "Created a non-bookable DRAFT Studio from a verified ownership claim.",
          metadata: {
            claimId: claim.id,
            initiatedByClaimantId: claimant.id,
            studioId: createdStudio.id,
          },
        },
      });

      return {
        studioId: createdStudio.id,
        candidateId: candidate.id,
        alreadyConverted: false,
      };
    },
    { isolationLevel: "Serializable" },
  );

  await notifyUser({
    userId: input.claimantId,
    type: "DISCOVERY_ONBOARDING_STARTED",
    title: "Your claimed studio is ready for onboarding",
    body: "36 created a private draft listing from your verified claim. Add rooms, pricing, equipment, photos and opening hours before submitting it for marketplace verification.",
    href: `/owner/studios/${result.studioId}`,
  });

  if (!result.alreadyConverted) {
    await trackMarketplaceEvent({
      eventType: "DISCOVERY_ONBOARDING_STARTED",
      userId: input.claimantId,
      studioId: result.studioId,
      metadata: {
        candidateStudioId: result.candidateId,
        claimId: input.claimId,
      },
    });
  }

  return result;
}
