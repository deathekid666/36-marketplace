import type { CandidateStudioClaimStatus } from "@prisma/client";

import type { DirectoryProfileV2 } from "@/lib/discovery/profile-v2";

export type AcquisitionCandidate = {
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  address: string | null;
  city: string | null;
};

export type AcquisitionReadiness = {
  percent: number;
  complete: number;
  total: number;
  readyForBookingOnboarding: boolean;
  steps: Array<{
    key: string;
    label: string;
    complete: boolean;
  }>;
};

export function ownerAcquisitionReadiness(input: {
  claimStatus: CandidateStudioClaimStatus | string;
  candidate: AcquisitionCandidate;
  profile: DirectoryProfileV2;
  onboardingAvailable: boolean;
  converted: boolean;
}) {
  const verified = input.claimStatus === "VERIFIED";
  const hasPublicContact = Boolean(
    input.candidate.phone ||
      input.candidate.email ||
      input.candidate.website,
  );
  const hasLocation = Boolean(
    input.candidate.city || input.candidate.address,
  );

  const steps = [
    {
      key: "claim",
      label: "Ownership verified",
      complete: verified,
    },
    {
      key: "contact",
      label: "Public contact",
      complete: hasPublicContact,
    },
    {
      key: "location",
      label: "Location",
      complete: hasLocation,
    },
    {
      key: "description",
      label: "Studio description",
      complete: Boolean(input.profile.description),
    },
    {
      key: "services",
      label: "Services",
      complete: input.profile.services.length > 0,
    },
    {
      key: "equipment",
      label: "Equipment",
      complete: input.profile.equipment.length > 0,
    },
    {
      key: "hours",
      label: "Opening hours",
      complete: Boolean(input.profile.openingHours),
    },
    {
      key: "photos",
      label: "Studio photos",
      complete: input.profile.photoUrls.length > 0,
    },
  ];

  const complete = steps.filter((step) => step.complete).length;
  const total = steps.length;
  const percent = Math.round((complete / total) * 100);

  return {
    percent,
    complete,
    total,
    readyForBookingOnboarding:
      verified &&
      input.onboardingAvailable &&
      !input.converted &&
      percent >= 75,
    steps,
  } satisfies AcquisitionReadiness;
}

export function acquisitionPriorityScore(input: {
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  onboardingAvailable: boolean;
  ownerVerified: boolean;
  claimPending: boolean;
}) {
  let score = 0;
  if (input.onboardingAvailable) score += 100;
  if (input.phone) score += 30;
  if (input.email) score += 25;
  if (input.website) score += 18;
  if (input.instagram) score += 12;
  if (input.claimPending) score -= 150;
  if (input.ownerVerified) score -= 250;
  return score;
}
