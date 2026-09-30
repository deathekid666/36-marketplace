"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import {
  parseClaimRelationship,
  submitCandidateClaim,
} from "@/lib/discovery/claims";

function text(form: FormData, name: string, max: number) {
  return String(form.get(name) || "").trim().slice(0, max);
}

function claimErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "CLAIM_FAILED";
  const map: Record<string, string> = {
    CLAIM_OWNER_ACCOUNT_REQUIRED: "owner-account-required",
    CLAIM_EMAIL_VERIFICATION_REQUIRED: "verify-email",
    CLAIM_CANDIDATE_NOT_FOUND: "candidate-not-found",
    CLAIM_CANDIDATE_NOT_AVAILABLE: "candidate-not-available",
    CLAIM_ALREADY_VERIFIED: "already-verified",
    CLAIM_ALREADY_PENDING: "already-pending",
    CLAIM_BUSINESS_EMAIL_INVALID: "business-email-invalid",
    CLAIM_PROOF_URL_INVALID: "proof-url-invalid",
    CLAIM_EVIDENCE_REQUIRED: "evidence-required",
  };
  return map[message] || "claim-failed";
}

export async function submitCandidateClaimAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const candidateStudioId = text(form, "candidateStudioId", 80);
  const slug = text(form, "slug", 160);
  const relationship = parseClaimRelationship(form.get("relationship"));

  if (!candidateStudioId || !slug || !relationship) {
    redirect(`/discover/${slug || ""}/claim?error=invalid-form`);
  }

  let destination = `/discover/${slug}/claim?error=claim-failed`;

  try {
    await submitCandidateClaim({
      candidateStudioId,
      claimantId: user.id,
      relationship,
      businessEmail: text(form, "businessEmail", 320),
      businessPhone: text(form, "businessPhone", 80),
      proofUrl: text(form, "proofUrl", 500),
      evidenceNote: text(form, "evidenceNote", 2000),
    });

    revalidatePath("/owner/claims");
    revalidatePath(`/discover/${slug}`);
    destination = "/owner/claims?result=submitted";
  } catch (error) {
    destination = `/discover/${slug}/claim?error=${claimErrorCode(error)}`;
  }

  redirect(destination);
}
