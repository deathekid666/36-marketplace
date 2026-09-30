import {
  CandidateStudioTransitionActor,
  DiscoveryStudioCategory,
} from "@prisma/client";

import { trackMarketplaceEvent } from "@/lib/analytics";
import { db } from "@/lib/db";
import { normalizeSearchText } from "@/lib/discovery/normalization";
import { isUnsafeDiscoveryProofUrl } from "@/lib/discovery/security";
import { normalizeEmail, validateEmail } from "@/lib/validation";

export type UpdateClaimedDirectoryProfileInput = {
  claimId: string;
  claimantId: string;
  name: string;
  category: DiscoveryStudioCategory;
  phone: string;
  email?: string;
  website?: string;
  instagram?: string;
  region?: string;
  city?: string;
  district?: string;
  postalCode?: string;
  address?: string;
};

function clean(value: string | undefined, max: number) {
  return String(value || "").trim().slice(0, max);
}

function publicUrl(value: string | undefined, max: number) {
  const raw = clean(value, max);
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("OWNER_PROFILE_URL_INVALID");
  }

  if (isUnsafeDiscoveryProofUrl(url.toString())) {
    throw new Error("OWNER_PROFILE_URL_UNSAFE");
  }

  return url.toString();
}

export async function updateClaimedDirectoryProfile(
  input: UpdateClaimedDirectoryProfileInput,
) {
  const name = clean(input.name, 180);
  const phone = clean(input.phone, 80);
  const rawEmail = clean(input.email, 320);
  const email = rawEmail ? normalizeEmail(rawEmail) : null;
  const website = publicUrl(input.website, 500);
  const instagram = publicUrl(input.instagram, 500);
  const region = clean(input.region, 160) || null;
  const city = clean(input.city, 160) || null;
  const district = clean(input.district, 160) || null;
  const postalCode = clean(input.postalCode, 40) || null;
  const address = clean(input.address, 500) || null;

  if (name.length < 2) throw new Error("OWNER_PROFILE_NAME_REQUIRED");
  if (phone.length < 5) throw new Error("OWNER_PROFILE_PHONE_REQUIRED");
  if (email && !validateEmail(email)) throw new Error("OWNER_PROFILE_EMAIL_INVALID");

  const result = await db.$transaction(async (tx) => {
    const claimant = await tx.user.findUnique({
      where: { id: input.claimantId },
      select: { id: true, role: true, status: true, emailVerifiedAt: true },
    });

    if (
      !claimant ||
      claimant.role !== "STUDIO_OWNER" ||
      claimant.status !== "ACTIVE" ||
      !claimant.emailVerifiedAt
    ) {
      throw new Error("OWNER_PROFILE_ACCOUNT_INVALID");
    }

    const claim = await tx.candidateStudioClaim.findFirst({
      where: {
        id: input.claimId,
        claimantId: claimant.id,
        status: "VERIFIED",
      },
      include: {
        candidateStudio: true,
      },
    });

    if (!claim) throw new Error("OWNER_PROFILE_CLAIM_NOT_VERIFIED");

    const candidate = claim.candidateStudio;
    if (candidate.status === "CONVERTED") {
      throw new Error("OWNER_PROFILE_USE_BOOKING_LISTING");
    }
    if (candidate.status !== "ENRICHED" && candidate.status !== "APPROVED") {
      throw new Error("OWNER_PROFILE_CANDIDATE_UNAVAILABLE");
    }

    const changedFields: string[] = [];
    const proposed = {
      name,
      normalizedName: normalizeSearchText(name),
      category: input.category,
      phone,
      email,
      website,
      instagram,
      region,
      city,
      district,
      postalCode,
      address,
    };

    for (const [key, value] of Object.entries(proposed)) {
      const current = candidate[key as keyof typeof candidate];
      const normalizedCurrent = current == null ? null : String(current);
      const normalizedNext = value == null ? null : String(value);
      if (normalizedCurrent !== normalizedNext) changedFields.push(key);
    }

    await tx.candidateStudio.update({
      where: { id: candidate.id },
      data: proposed,
    });

    await tx.candidateStudioTransition.create({
      data: {
        candidateStudioId: candidate.id,
        fromStatus: candidate.status,
        toStatus: candidate.status,
        actor: CandidateStudioTransitionActor.SYSTEM,
        actorUserId: claimant.id,
        reasonCode: "VERIFIED_OWNER_PROFILE_UPDATE",
        note:
          changedFields.length > 0
            ? "Verified owner updated the public directory profile."
            : "Verified owner saved the public directory profile without material changes.",
        metadata: {
          claimId: claim.id,
          changedFields,
        },
      },
    });

    return {
      claimId: claim.id,
      candidateId: candidate.id,
      slug: candidate.slug,
      name,
      changedFields,
    };
  });

  await trackMarketplaceEvent({
    eventType: "DISCOVERY_OWNER_PROFILE_UPDATED",
    userId: input.claimantId,
    metadata: {
      candidateStudioId: result.candidateId,
      claimId: result.claimId,
      changedFieldCount: result.changedFields.length,
    },
  });

  return result;
}
