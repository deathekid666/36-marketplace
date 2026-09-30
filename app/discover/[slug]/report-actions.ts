"use server";

import { redirect } from "next/navigation";

import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { notifyUser } from "@/lib/notifications";
import { consumeRateLimit } from "@/lib/rate-limit";
import { trackMarketplaceEvent } from "@/lib/analytics";

const REPORT_REASONS = new Set([
  "PHONE_WRONG",
  "BUSINESS_CLOSED",
  "WRONG_STUDIO",
  "WRONG_LOCATION",
  "WEBSITE_BROKEN",
  "DUPLICATE",
  "OTHER",
]);

function text(form: FormData, name: string, max: number) {
  return String(form.get(name) || "").trim().slice(0, max);
}

export async function submitDiscoveryContactReportAction(form: FormData) {
  const user = await requireUser();
  const candidateId = text(form, "candidateId", 80);
  const slug = text(form, "slug", 180);
  const reason = text(form, "reason", 40);
  const details = text(form, "details", 1200);

  if (!candidateId || !slug || !REPORT_REASONS.has(reason)) {
    redirect("/discover/" + slug + "?report=invalid");
  }

  const [userRate, candidateRate] = await Promise.all([
    consumeRateLimit({
      key: "discovery-report-user:" + user.id,
      action: "DISCOVERY_CONTACT_REPORT_DAY",
      limit: 10,
      windowSeconds: 24 * 60 * 60,
    }),
    consumeRateLimit({
      key: "discovery-report-candidate:" + user.id + ":" + candidateId,
      action: "DISCOVERY_CONTACT_REPORT_CANDIDATE_DAY",
      limit: 2,
      windowSeconds: 24 * 60 * 60,
    }),
  ]);

  if (!userRate.allowed || !candidateRate.allowed) {
    redirect("/discover/" + slug + "?report=rate-limited");
  }

  const candidate = await db.candidateStudio.findFirst({
    where: { id: candidateId, slug },
    select: { id: true, name: true, slug: true },
  });

  if (!candidate) {
    redirect("/discover?report=not-found");
  }

  const admins = await db.user.findMany({
    where: { role: "ADMIN", status: "ACTIVE" },
    select: { id: true },
  });

  const reasonLabel = reason.replaceAll("_", " ").toLowerCase();
  const body =
    candidate.name +
    " was reported for " +
    reasonLabel +
    (details ? ". Reporter note: " + details : ".");

  await Promise.all(
    admins.map((admin) =>
      notifyUser({
        userId: admin.id,
        type: "DISCOVERY_CONTACT_REPORTED",
        title: "Directory contact report",
        body,
        href: "/admin/discovery/" + candidate.id,
      }),
    ),
  );

  await trackMarketplaceEvent({
    eventType: "DISCOVERY_CONTACT_REPORTED",
    userId: user.id,
    metadata: {
      candidateStudioId: candidate.id,
      reason,
      hasDetails: Boolean(details),
    },
  });

  redirect("/discover/" + candidate.slug + "?report=submitted");
}
