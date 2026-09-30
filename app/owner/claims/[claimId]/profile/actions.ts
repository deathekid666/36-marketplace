"use server";

import { DiscoveryStudioCategory } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRole } from "@/lib/auth";
import { updateClaimedDirectoryProfile } from "@/lib/discovery/owner-profile";

function text(form: FormData, name: string, max: number) {
  return String(form.get(name) || "").trim().slice(0, max);
}

function category(value: FormDataEntryValue | null) {
  const raw = String(value || "");
  return Object.values(DiscoveryStudioCategory).includes(
    raw as DiscoveryStudioCategory,
  )
    ? (raw as DiscoveryStudioCategory)
    : null;
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "OWNER_PROFILE_FAILED";
  const map: Record<string, string> = {
    OWNER_PROFILE_NAME_REQUIRED: "name-required",
    OWNER_PROFILE_PHONE_REQUIRED: "phone-required",
    OWNER_PROFILE_EMAIL_INVALID: "email-invalid",
    OWNER_PROFILE_URL_INVALID: "url-invalid",
    OWNER_PROFILE_URL_UNSAFE: "url-unsafe",
    OWNER_PROFILE_PHOTO_URL_INVALID: "photo-url-invalid",
    OWNER_PROFILE_WHATSAPP_INVALID: "whatsapp-invalid",
    OWNER_PROFILE_CLAIM_NOT_VERIFIED: "claim-not-verified",
    OWNER_PROFILE_CANDIDATE_UNAVAILABLE: "candidate-unavailable",
    OWNER_PROFILE_USE_BOOKING_LISTING: "use-booking-listing",
    OWNER_PROFILE_ACCOUNT_INVALID: "account-invalid",
  };
  return map[message] || "save-failed";
}

export async function updateClaimedDirectoryProfileAction(form: FormData) {
  const user = await requireRole("STUDIO_OWNER");
  const claimId = text(form, "claimId", 80);
  const parsedCategory = category(form.get("category"));

  if (!claimId || !parsedCategory) {
    redirect("/owner/claims?error=profile-invalid");
  }

  try {
    const result = await updateClaimedDirectoryProfile({
      claimId,
      claimantId: user.id,
      name: text(form, "name", 180),
      category: parsedCategory,
      phone: text(form, "phone", 80),
      email: text(form, "email", 320),
      website: text(form, "website", 500),
      instagram: text(form, "instagram", 500),
      region: text(form, "region", 160),
      city: text(form, "city", 160),
      district: text(form, "district", 160),
      postalCode: text(form, "postalCode", 40),
      address: text(form, "address", 500),
      description: text(form, "description", 2400),
      whatsapp: text(form, "whatsapp", 80),
      services: text(form, "services", 2200),
      equipment: text(form, "equipment", 3600),
      languages: text(form, "languages", 800),
      openingHours: text(form, "openingHours", 1000),
      photoUrls: text(form, "photoUrls", 5000),
    });

    revalidatePath("/discover");
    revalidatePath("/owner/claims");
    revalidatePath("/discover/" + result.slug);
    redirect("/owner/claims/" + claimId + "/profile?saved=1");
  } catch (error) {
    redirect(
      "/owner/claims/" +
        claimId +
        "/profile?error=" +
        encodeURIComponent(errorCode(error)),
    );
  }
}
