"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { startClaimedStudioOnboarding } from "@/lib/discovery/onboarding";

function onboardingError(error: unknown) {
  const message = error instanceof Error ? error.message : "ONBOARDING_FAILED";
  if (message === "ONBOARDING_CLAIM_NOT_VERIFIED") return "claim-not-verified";
  if (message === "ONBOARDING_MARKET_NOT_SUPPORTED") return "market-not-supported";
  if (message === "ONBOARDING_ALREADY_CONVERTED") return "already-converted";
  if (message === "ONBOARDING_CONCURRENT_CONVERSION") return "concurrent-conversion";
  return "onboarding-failed";
}

export async function startClaimedStudioOnboardingAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const claimId = String(form.get("claimId") || "").trim();

  if (!claimId) redirect("/owner/claims?error=onboarding-failed");

  let destination = "/owner/claims?error=onboarding-failed";

  try {
    const result = await startClaimedStudioOnboarding({
      claimId,
      claimantId: user.id,
    });

    revalidatePath("/owner");
    revalidatePath("/owner/claims");
    revalidatePath("/discover");
    destination = `/owner/studios/${result.studioId}?from=claim`;
  } catch (error) {
    destination = `/owner/claims?error=${onboardingError(error)}`;
  }

  redirect(destination);
}
