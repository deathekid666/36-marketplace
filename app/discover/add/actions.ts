"use server";

import { DiscoveryStudioCategory } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { trackMarketplaceEvent } from "@/lib/analytics";
import { db } from "@/lib/db";
import { ingestDiscoveryStudio } from "@/lib/discovery/ingest";
import { normalizeSearchText } from "@/lib/discovery/normalization";
import { isUnsafeDiscoveryProofUrl } from "@/lib/discovery/security";
import { notifyUser } from "@/lib/notifications";
import { consumeRateLimit } from "@/lib/rate-limit";
import { normalizeEmail, validateEmail } from "@/lib/validation";

function text(form: FormData, name: string, max: number) {
  return String(form.get(name) || "").trim().slice(0, max);
}

function optionalUrl(rawValue: string) {
  if (!rawValue) return null;
  let url: URL;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error("SUBMISSION_URL_INVALID");
  }
  if (isUnsafeDiscoveryProofUrl(url.toString())) {
    throw new Error("SUBMISSION_URL_UNSAFE");
  }
  return url.toString();
}

function selectedCategory(value: string) {
  return Object.values(DiscoveryStudioCategory).includes(
    value as DiscoveryStudioCategory,
  )
    ? (value as DiscoveryStudioCategory)
    : null;
}

function errorCode(error: unknown) {
  const message = error instanceof Error ? error.message : "SUBMISSION_FAILED";
  const map: Record<string, string> = {
    SUBMISSION_NAME_REQUIRED: "name",
    SUBMISSION_PHONE_REQUIRED: "phone",
    SUBMISSION_COUNTRY_INVALID: "country",
    SUBMISSION_CITY_REQUIRED: "city",
    SUBMISSION_CATEGORY_INVALID: "category",
    SUBMISSION_EMAIL_INVALID: "email",
    SUBMISSION_URL_INVALID: "url",
    SUBMISSION_URL_UNSAFE: "url",
  };
  return map[message] || "failed";
}

export async function submitMissingStudioAction(form: FormData) {
  const user = await requireUser();

  const rate = await consumeRateLimit({
    key: "missing-studio:" + user.id,
    action: "DISCOVERY_COMMUNITY_SUBMISSION_DAY",
    limit: 5,
    windowSeconds: 24 * 60 * 60,
  });

  if (!rate.allowed) {
    redirect("/discover/add?error=rate-limited");
  }

  const name = text(form, "name", 180);
  const phone = text(form, "phone", 80);
  const countryCode = text(form, "countryCode", 2).toUpperCase();
  const city = text(form, "city", 160);
  const region = text(form, "region", 160) || null;
  const district = text(form, "district", 160) || null;
  const postalCode = text(form, "postalCode", 40) || null;
  const address = text(form, "address", 500) || null;
  const category = selectedCategory(text(form, "category", 40));
  const rawEmail = text(form, "email", 320);
  const email = rawEmail ? normalizeEmail(rawEmail) : null;

  try {
    if (name.length < 2) throw new Error("SUBMISSION_NAME_REQUIRED");
    if (phone.replace(/\D/g, "").length < 8) {
      throw new Error("SUBMISSION_PHONE_REQUIRED");
    }
    if (!/^[A-Z]{2}$/.test(countryCode)) {
      throw new Error("SUBMISSION_COUNTRY_INVALID");
    }
    if (city.length < 2) throw new Error("SUBMISSION_CITY_REQUIRED");
    if (!category) throw new Error("SUBMISSION_CATEGORY_INVALID");
    if (email && !validateEmail(email)) {
      throw new Error("SUBMISSION_EMAIL_INVALID");
    }

    const website = optionalUrl(text(form, "website", 500));
    const instagram = optionalUrl(text(form, "instagram", 500));
    const sourceId = randomUUID();

    const result = await ingestDiscoveryStudio({
      provider: "COMMUNITY",
      sourceKey: "community:" + sourceId,
      externalId: sourceId,
      sourceUrl: website,
      providerCategory: category,
      attribution: "Submitted by a signed-in 36 user",
      licenseUrl: null,
      name,
      normalizedName: normalizeSearchText(name),
      category,
      categoryConfidence: "USER_SELECTED",
      categoryEvidence: ["community:selected-category"],
      categoryAlternatives: [],
      countryCode,
      country: countryCode,
      region,
      city,
      district,
      postalCode,
      address,
      latitude: null,
      longitude: null,
      phone,
      email,
      website,
      instagram,
      issues: ["COMMUNITY_SUBMISSION_REVIEW_REQUIRED"],
      slugHint: sourceId,
      metadata: {
        submittedByUserId: user.id,
        submittedByRole: user.role,
      },
    });

    const candidate = await db.candidateStudio.findUnique({
      where: { id: result.candidateId },
      select: { id: true, name: true, slug: true, status: true },
    });

    const admins = await db.user.findMany({
      where: { role: "ADMIN", status: "ACTIVE" },
      select: { id: true },
    });

    await Promise.all(
      admins.map((admin) =>
        notifyUser({
          userId: admin.id,
          type: "DISCOVERY_COMMUNITY_SUBMITTED",
          title: "Missing studio submitted",
          body:
            name +
            " · " +
            city +
            " · " +
            countryCode +
            ". Review the candidate before publishing.",
          href: candidate ? "/admin/discovery/" + candidate.id : "/admin/discovery",
        }),
      ),
    );

    await trackMarketplaceEvent({
      eventType: "DISCOVERY_COMMUNITY_SUBMITTED",
      userId: user.id,
      metadata: {
        candidateStudioId: result.candidateId,
        outcome: result.outcome,
        countryCode,
        category,
      },
    });

    redirect(
      "/discover/add?submitted=1&outcome=" +
        encodeURIComponent(result.outcome),
    );
  } catch (error) {
    redirect(
      "/discover/add?error=" + encodeURIComponent(errorCode(error)),
    );
  }
}
