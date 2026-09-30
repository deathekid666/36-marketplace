"use server";

import { CandidateStudioStatus, CandidateStudioTransitionActor } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { transitionCandidateStudio } from "@/lib/discovery/lifecycle";

function text(form: FormData, name: string, max = 2000) {
  return String(form.get(name) ?? "").trim().slice(0, max);
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "CANDIDATE_TRANSITION_FAILED";

  if (message.startsWith("CANDIDATE_TRANSITION_NOT_ALLOWED")) return "transition-not-allowed";
  if (message === "CANDIDATE_NOT_FOUND") return "candidate-not-found";
  if (message === "CANDIDATE_ADMIN_ACTOR_INVALID") return "admin-invalid";
  if (message === "CANDIDATE_CATEGORY_UNRESOLVED") return "category-unresolved";
  if (message === "CANDIDATE_COUNTRY_UNRESOLVED") return "country-unresolved";
  if (message === "CANDIDATE_LOCATION_INCOMPLETE") return "location-incomplete";
  if (message === "CANDIDATE_SOURCE_REQUIRED") return "source-required";
  if (message === "CANDIDATE_IDENTITY_INCOMPLETE") return "identity-incomplete";
  if (message === "CANDIDATE_TRANSITION_CONCURRENT_UPDATE") return "concurrent-update";

  return "transition-failed";
}

async function runTransition(
  form: FormData,
  toStatus: CandidateStudioStatus,
  reasonCode: string,
  resultCode: string,
) {
  const admin = await requireRole("ADMIN");
  const candidateId = text(form, "candidateId", 80);
  if (!candidateId) redirect("/admin/discovery?error=candidate-not-found");

  const note = text(form, "note", 2000);

  try {
    await transitionCandidateStudio({
      candidateId,
      toStatus,
      actor: CandidateStudioTransitionActor.ADMIN,
      actorUserId: admin.id,
      reasonCode,
      note,
    });
  } catch (error) {
    redirect(`/admin/discovery/${candidateId}?error=${errorCode(error)}`);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/discovery");
  revalidatePath(`/admin/discovery/${candidateId}`);
  redirect(`/admin/discovery/${candidateId}?result=${resultCode}`);
}

export async function approveCandidateAction(form: FormData) {
  return runTransition(
    form,
    CandidateStudioStatus.APPROVED,
    "ADMIN_APPROVED",
    "approved",
  );
}

export async function rejectCandidateAction(form: FormData) {
  return runTransition(
    form,
    CandidateStudioStatus.REJECTED,
    "ADMIN_REJECTED",
    "rejected",
  );
}

export async function archiveCandidateAction(form: FormData) {
  return runTransition(
    form,
    CandidateStudioStatus.ARCHIVED,
    "ADMIN_ARCHIVED",
    "archived",
  );
}

export async function requestCandidateReviewAction(form: FormData) {
  return runTransition(
    form,
    CandidateStudioStatus.REVIEW_REQUIRED,
    "ADMIN_REVIEW_REQUIRED",
    "review-required",
  );
}

export async function markCandidateEnrichedAction(form: FormData) {
  return runTransition(
    form,
    CandidateStudioStatus.ENRICHED,
    "ADMIN_MARKED_ENRICHED",
    "enriched",
  );
}
