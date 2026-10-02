import {
  CandidateStudioStatus,
  CandidateStudioTransitionActor,
  DiscoveryStudioCategory,
  StudioCategory,
} from "@prisma/client";

import { db } from "@/lib/db";
import {
  currencyForCountry,
  normalizeCountryCode,
} from "@/lib/commerce";
import { timeZoneForCoordinates } from "@/lib/time";
import { notifyUser } from "@/lib/notifications";
import { trackMarketplaceEvent } from "@/lib/analytics";
import { isDiscoveryRolloutEnabled } from "@/lib/discovery/rollout";
import { parseDirectoryProfileV2 } from "@/lib/discovery/profile-v2";

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
              transitions: {
                where: { reasonCode: "VERIFIED_OWNER_PROFILE_UPDATE" },
                orderBy: { createdAt: "desc" },
                take: 1,
                select: { metadata: true },
              },
            },
          },
        },
      });

      if (!claim) throw new Error("ONBOARDING_CLAIM_NOT_FOUND");
      if (claim.status !== "VERIFIED") throw new Error("ONBOARDING_CLAIM_NOT_VERIFIED");

      const candidate = claim.candidateStudio;
      const directoryProfile = parseDirectoryProfileV2(
        candidate.transitions[0]?.metadata,
      );

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

      if (
        candidate.status !== CandidateStudioStatus.ENRICHED &&
        candidate.status !== CandidateStudioStatus.APPROVED
      ) {
        throw new Error("ONBOARDING_CANDIDATE_NOT_AVAILABLE");
      }

      // Conversion is allow-listed by rollout scope and preserves the
      // discovered market so the resulting studio is immediately global-safe.
      if (!isDiscoveryRolloutEnabled(candidate, "ONBOARDING")) {
        throw new Error("ONBOARDING_MARKET_NOT_SUPPORTED");
      }

      const countryCode = normalizeCountryCode(candidate.countryCode);
      const city = String(candidate.city || "").trim();
      if (!countryCode) {
        throw new Error("ONBOARDING_COUNTRY_UNRESOLVED");
      }
      if (!city) {
        throw new Error("ONBOARDING_CITY_UNRESOLVED");
      }
      const currency = currencyForCountry(countryCode);
      const timeZone = timeZoneForCoordinates(
        candidate.latitude,
        candidate.longitude,
        "UTC",
      );

      const createdStudio = await tx.studio.create({
        data: {
          ownerId: claimant.id,
          name: candidate.name,
          slug: studioSlug(candidate.slug, claim.id),
          description: directoryProfile.description,
          primaryCategory: studioCategory(candidate.category),
          city,
          neighborhood: candidate.district || "",
          address: candidate.address || "",
          countryCode,
          currency,
          timeZone,
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

      if (directoryProfile.photoUrls.length > 0) {
        await tx.studioPhoto.createMany({
          data: directoryProfile.photoUrls.map((url, index) => ({
            studioId: createdStudio.id,
            url,
            alt: candidate.name + " studio photo",
            sortOrder: index,
          })),
        });
      }

      const updated = await tx.candidateStudio.updateMany({
        where: {
          id: candidate.id,
          status: candidate.status,
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
          fromStatus: candidate.status,
          toStatus: CandidateStudioStatus.CONVERTED,
          actor: CandidateStudioTransitionActor.SYSTEM,
          reasonCode: "VERIFIED_CLAIM_CONVERSION",
          note: "Created a non-bookable DRAFT Studio from a verified ownership claim.",
          metadata: {
            claimId: claim.id,
            initiatedByClaimantId: claimant.id,
            studioId: createdStudio.id,
            importedDirectoryProfile: {
              description: Boolean(directoryProfile.description),
              photoCount: directoryProfile.photoUrls.length,
              serviceCount: directoryProfile.services.length,
              equipmentCount: directoryProfile.equipment.length,
              hasOpeningHoursReference: Boolean(directoryProfile.openingHours),
            },
          },
        },
      });

      return {
        studioId: createdStudio.id,
        candidateId: candidate.id,
        alreadyConverted: false,
        importedDirectoryPhotoCount: directoryProfile.photoUrls.length,
      };
    },
    { isolationLevel: "Serializable" },
  );

  await notifyUser({
    userId: input.claimantId,
    type: "DISCOVERY_ONBOARDING_STARTED",
    title: "Your claimed studio is ready for onboarding",
    body:
      "36 created a private draft listing from your verified claim and carried over verified profile details where possible. Add rooms, pricing, availability and any missing marketplace information before submitting it for verification.",
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
