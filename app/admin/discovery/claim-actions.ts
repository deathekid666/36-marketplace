"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { reviewCandidateClaim } from "@/lib/discovery/claims";

function text(form: FormData, name: string, max: number) {
  return String(form.get(name) || "").trim().slice(0, max);
}

function reviewError(error: unknown) {
  const message = error instanceof Error ? error.message : "CLAIM_REVIEW_FAILED";
  if (message === "CLAIM_ALREADY_VERIFIED") return "claim-already-verified";
  if (message === "CLAIM_CANDIDATE_NOT_AVAILABLE") return "claim-candidate-unavailable";
  if (message === "CLAIM_REVIEW_NOT_ALLOWED") return "claim-review-not-allowed";
  if (message === "CLAIM_NOT_FOUND") return "claim-not-found";
  return "claim-review-failed";
}

async function runReview(form: FormData, decision: "VERIFY" | "REJECT") {
  const admin = await requireRole("ADMIN");
  const claimId = text(form, "claimId", 80);
  const candidateId = text(form, "candidateId", 80);
  const adminNote = text(form, "adminNote", 2000);

  if (!claimId || !candidateId) {
    redirect("/admin/discovery?error=claim-not-found");
  }

  let destination = `/admin/discovery/${candidateId}?error=claim-review-failed`;

  try {
    await reviewCandidateClaim({
      claimId,
      adminId: admin.id,
      decision,
      adminNote,
    });

    revalidatePath("/admin/discovery");
    revalidatePath(`/admin/discovery/${candidateId}`);
    revalidatePath("/owner/claims");
    destination = `/admin/discovery/${candidateId}?result=${decision === "VERIFY" ? "claim-verified" : "claim-rejected"}`;
  } catch (error) {
    destination = `/admin/discovery/${candidateId}?error=${reviewError(error)}`;
  }

  redirect(destination);
}

export async function verifyCandidateClaimAction(form: FormData) {
  return runReview(form, "VERIFY");
}

export async function rejectCandidateClaimAction(form: FormData) {
  return runReview(form, "REJECT");
}
