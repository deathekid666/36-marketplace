import {
  CandidateStudioClaimRelationship,
  CandidateStudioClaimStatus,
  Prisma,
} from "@prisma/client";

import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";
import { normalizeEmail, validateEmail } from "@/lib/validation";

export type SubmitCandidateClaimInput = {
  candidateStudioId: string;
  claimantId: string;
  relationship: CandidateStudioClaimRelationship;
  businessEmail: string;
  businessPhone?: string;
  proofUrl?: string;
  evidenceNote?: string;
};

function cleanText(value: string | undefined, max: number) {
  return String(value || "").trim().slice(0, max);
}

function cleanProofUrl(value: string | undefined) {
  const raw = cleanText(value, 500);
  if (!raw) return "";

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error("CLAIM_PROOF_URL_INVALID");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("CLAIM_PROOF_URL_INVALID");
  }

  return parsed.toString();
}

export function parseClaimRelationship(value: unknown) {
  if (value === "OWNER") return CandidateStudioClaimRelationship.OWNER;
  if (value === "MANAGER") return CandidateStudioClaimRelationship.MANAGER;
  if (value === "AUTHORIZED_REPRESENTATIVE") {
    return CandidateStudioClaimRelationship.AUTHORIZED_REPRESENTATIVE;
  }
  return null;
}

export async function submitCandidateClaim(input: SubmitCandidateClaimInput) {
  const businessEmail = normalizeEmail(input.businessEmail);
  const businessPhone = cleanText(input.businessPhone, 80);
  const proofUrl = cleanProofUrl(input.proofUrl);
  const evidenceNote = cleanText(input.evidenceNote, 2000);

  if (!validateEmail(businessEmail)) throw new Error("CLAIM_BUSINESS_EMAIL_INVALID");
  if (!proofUrl && evidenceNote.length < 20) throw new Error("CLAIM_EVIDENCE_REQUIRED");

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
        throw new Error("CLAIM_OWNER_ACCOUNT_REQUIRED");
      }
      if (!claimant.emailVerifiedAt) throw new Error("CLAIM_EMAIL_VERIFICATION_REQUIRED");

      const candidate = await tx.candidateStudio.findUnique({
        where: { id: input.candidateStudioId },
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
        },
      });

      if (!candidate) throw new Error("CLAIM_CANDIDATE_NOT_FOUND");
      if (candidate.status !== "APPROVED") throw new Error("CLAIM_CANDIDATE_NOT_AVAILABLE");

      const existingVerified = await tx.candidateStudioClaim.findFirst({
        where: {
          candidateStudioId: candidate.id,
          status: CandidateStudioClaimStatus.VERIFIED,
        },
        select: { id: true, claimantId: true },
      });

      if (existingVerified && existingVerified.claimantId !== claimant.id) {
        throw new Error("CLAIM_ALREADY_VERIFIED");
      }

      const existing = await tx.candidateStudioClaim.findUnique({
        where: {
          candidateStudioId_claimantId: {
            candidateStudioId: candidate.id,
            claimantId: claimant.id,
          },
        },
      });

      if (existing?.status === CandidateStudioClaimStatus.VERIFIED) {
        throw new Error("CLAIM_ALREADY_VERIFIED");
      }
      if (existing?.status === CandidateStudioClaimStatus.SUBMITTED) {
        throw new Error("CLAIM_ALREADY_PENDING");
      }

      const data = {
        relationship: input.relationship,
        businessEmail,
        businessPhone,
        proofUrl,
        evidenceNote,
        status: CandidateStudioClaimStatus.SUBMITTED,
        reviewedById: null,
        reviewedAt: null,
        adminNote: "",
        submittedAt: new Date(),
      } satisfies Prisma.CandidateStudioClaimUncheckedUpdateInput;

      const claim = existing
        ? await tx.candidateStudioClaim.update({
            where: { id: existing.id },
            data,
            select: { id: true, status: true, candidateStudioId: true },
          })
        : await tx.candidateStudioClaim.create({
            data: {
              candidateStudioId: candidate.id,
              claimantId: claimant.id,
              relationship: input.relationship,
              businessEmail,
              businessPhone,
              proofUrl,
              evidenceNote,
            },
            select: { id: true, status: true, candidateStudioId: true },
          });

      return {
        claim,
        candidateName: candidate.name,
        candidateSlug: candidate.slug,
      };
    },
    { isolationLevel: "Serializable" },
  );

  const admins = await db.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE" },
    select: { id: true },
  });

  await Promise.all(
    admins.map((admin) =>
      notifyUser({
        userId: admin.id,
        type: "DISCOVERY_CLAIM_SUBMITTED",
        title: "Studio ownership claim submitted",
        body: `${result.candidateName} has a new ownership claim waiting for review.`,
        href: `/admin/discovery/${result.claim.candidateStudioId}`,
      }),
    ),
  );

  return result;
}

export async function withdrawCandidateClaim(claimId: string, claimantId: string) {
  const claim = await db.candidateStudioClaim.findFirst({
    where: { id: claimId, claimantId },
    select: { id: true, status: true },
  });

  if (!claim) throw new Error("CLAIM_NOT_FOUND");
  if (claim.status !== CandidateStudioClaimStatus.SUBMITTED) {
    throw new Error("CLAIM_WITHDRAW_NOT_ALLOWED");
  }

  return db.candidateStudioClaim.update({
    where: { id: claim.id },
    data: {
      status: CandidateStudioClaimStatus.WITHDRAWN,
      reviewedById: null,
      reviewedAt: null,
      adminNote: "",
    },
  });
}

export async function reviewCandidateClaim(input: {
  claimId: string;
  adminId: string;
  decision: "VERIFY" | "REJECT";
  adminNote?: string;
}) {
  const adminNote = cleanText(input.adminNote, 2000);

  const result = await db.$transaction(
    async (tx) => {
      const admin = await tx.user.findUnique({
        where: { id: input.adminId },
        select: { role: true, status: true },
      });
      if (!admin || admin.role !== "ADMIN" || admin.status !== "ACTIVE") {
        throw new Error("CLAIM_ADMIN_INVALID");
      }

      const claim = await tx.candidateStudioClaim.findUnique({
        where: { id: input.claimId },
        include: {
          candidateStudio: {
            select: { id: true, name: true, slug: true, status: true },
          },
          claimant: {
            select: { id: true, name: true },
          },
        },
      });

      if (!claim) throw new Error("CLAIM_NOT_FOUND");
      if (claim.status !== CandidateStudioClaimStatus.SUBMITTED) {
        throw new Error("CLAIM_REVIEW_NOT_ALLOWED");
      }
      if (claim.candidateStudio.status !== "APPROVED") {
        throw new Error("CLAIM_CANDIDATE_NOT_AVAILABLE");
      }

      if (input.decision === "VERIFY") {
        const otherVerified = await tx.candidateStudioClaim.findFirst({
          where: {
            candidateStudioId: claim.candidateStudioId,
            status: CandidateStudioClaimStatus.VERIFIED,
            NOT: { id: claim.id },
          },
          select: { id: true },
        });
        if (otherVerified) throw new Error("CLAIM_ALREADY_VERIFIED");
      }

      const status =
        input.decision === "VERIFY"
          ? CandidateStudioClaimStatus.VERIFIED
          : CandidateStudioClaimStatus.REJECTED;

      const updated = await tx.candidateStudioClaim.update({
        where: { id: claim.id },
        data: {
          status,
          reviewedById: input.adminId,
          reviewedAt: new Date(),
          adminNote,
        },
        select: {
          id: true,
          status: true,
          claimantId: true,
          candidateStudioId: true,
        },
      });

      return {
        claim: updated,
        candidateName: claim.candidateStudio.name,
        candidateSlug: claim.candidateStudio.slug,
      };
    },
    { isolationLevel: "Serializable" },
  );

  await notifyUser({
    userId: result.claim.claimantId,
    type:
      result.claim.status === CandidateStudioClaimStatus.VERIFIED
        ? "DISCOVERY_CLAIM_VERIFIED"
        : "DISCOVERY_CLAIM_REJECTED",
    title:
      result.claim.status === CandidateStudioClaimStatus.VERIFIED
        ? "Your studio claim was verified"
        : "Your studio claim needs changes",
    body:
      result.claim.status === CandidateStudioClaimStatus.VERIFIED
        ? `Ownership of ${result.candidateName} is verified. The listing is still not bookable until the 36 onboarding step is completed.`
        : `Your claim for ${result.candidateName} was not verified. Review the admin note and submit stronger evidence if needed.`,
    href: "/owner/claims",
  });

  return result;
}
