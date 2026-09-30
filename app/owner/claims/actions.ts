"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { withdrawCandidateClaim } from "@/lib/discovery/claims";

export async function withdrawCandidateClaimAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const claimId = String(form.get("claimId") || "").trim();

  if (!claimId) redirect("/owner/claims?error=claim-not-found");

  let destination = "/owner/claims?error=withdraw-failed";

  try {
    await withdrawCandidateClaim(claimId, user.id);
    revalidatePath("/owner/claims");
    destination = "/owner/claims?result=withdrawn";
  } catch {
    destination = "/owner/claims?error=withdraw-failed";
  }

  redirect(destination);
}
