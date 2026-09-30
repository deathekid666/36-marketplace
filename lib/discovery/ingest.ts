import {
  CandidateStudioStatus,
  CandidateStudioTransitionActor,
  DiscoveryStudioCategory,
  Prisma,
} from "@prisma/client";

import { db } from "@/lib/db";
import {
  chooseDedupMatch,
  type DedupCandidate,
} from "@/lib/discovery/deduplication";
import { transitionCandidateStudio } from "@/lib/discovery/lifecycle";
import { normalizeSearchText } from "@/lib/discovery/normalization";
import type { OpenStreetMapStudioRecord } from "@/lib/discovery/providers/openstreetmap";

export type DiscoveryIngestOutcome =
  | "CREATED_ENRICHED"
  | "CREATED_REVIEW"
  | "AUTO_MATCHED"
  | "REFRESHED";

export type DiscoveryIngestResult = {
  outcome: DiscoveryIngestOutcome;
  candidateId: string;
  sourceKey: string;
};

export type DiscoveryProviderStudioRecord = {
  provider: string;
  sourceKey: string;
  externalId: string;
  sourceUrl: string | null;
  providerCategory: string | null;
  attribution: string | null;
  licenseUrl: string | null;
  name: string;
  normalizedName: string;
  category: DiscoveryStudioCategory;
  categoryConfidence?: string | null;
  categoryEvidence?: string[];
  categoryAlternatives?: DiscoveryStudioCategory[];
  countryCode: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  issues: string[];
  metadata?: Prisma.InputJsonValue;
  slugHint?: string | null;
};

function decimalNumber(value: Prisma.Decimal | null) {
  return value == null ? null : Number(value.toString());
}

function candidateForDedup(candidate: {
  id: string;
  name: string;
  normalizedName: string;
  category: DiscoveryStudioCategory;
  countryCode: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  address: string | null;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  phone: string | null;
  website: string | null;
  instagram: string | null;
}): DedupCandidate {
  return {
    id: candidate.id,
    name: candidate.name,
    normalizedName: candidate.normalizedName,
    category: candidate.category,
    countryCode: candidate.countryCode,
    city: candidate.city,
    district: candidate.district,
    postalCode: candidate.postalCode,
    address: candidate.address,
    latitude: decimalNumber(candidate.latitude),
    longitude: decimalNumber(candidate.longitude),
    phone: candidate.phone,
    website: candidate.website,
    instagram: candidate.instagram,
  };
}

function sourceMetadata(record: DiscoveryProviderStudioRecord): Prisma.InputJsonObject {
  const base: Prisma.InputJsonObject = {
    provider: record.provider,
    sourceKey: record.sourceKey,
    externalId: record.externalId,
    sourceUrl: record.sourceUrl,
    providerCategory: record.providerCategory,
    categoryConfidence: record.categoryConfidence ?? null,
    categoryEvidence: record.categoryEvidence || [],
    categoryAlternatives: record.categoryAlternatives || [],
    issues: record.issues,
  };

  return record.metadata === undefined
    ? base
    : {
        ...base,
        providerMetadata: record.metadata,
      };
}

function slugBase(value: string) {
  const ascii = normalizeSearchText(value)
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return ascii || "studio";
}

function candidateSlug(record: DiscoveryProviderStudioRecord) {
  const provider = slugBase(record.provider).slice(0, 20);
  const identity = slugBase(record.slugHint || record.externalId || record.sourceKey).slice(-48);
  return `${slugBase(record.name).slice(0, 58)}-${provider}-${identity}`;
}

function shortlistWhere(
  record: DiscoveryProviderStudioRecord,
): Prisma.CandidateStudioWhereInput {
  const or: Prisma.CandidateStudioWhereInput[] = [
    { normalizedName: record.normalizedName },
  ];

  if (record.countryCode && record.city) {
    or.push({
      countryCode: record.countryCode,
      city: { equals: record.city, mode: "insensitive" },
    });
  }

  if (record.phone) or.push({ phone: record.phone });
  if (record.website) or.push({ website: record.website });
  if (record.instagram) or.push({ instagram: record.instagram });

  return { OR: or };
}

async function createSource(
  tx: Prisma.TransactionClient,
  candidateStudioId: string,
  record: DiscoveryProviderStudioRecord,
  now: Date,
) {
  return tx.candidateStudioSource.create({
    data: {
      candidateStudioId,
      provider: record.provider,
      sourceKey: record.sourceKey,
      externalId: record.externalId,
      sourceUrl: record.sourceUrl,
      providerCategory: record.providerCategory,
      attribution: record.attribution,
      licenseUrl: record.licenseUrl,
      active: true,
      collectedAt: now,
      lastCheckedAt: now,
    },
  });
}

export async function ingestDiscoveryStudio(
  record: DiscoveryProviderStudioRecord,
): Promise<DiscoveryIngestResult> {
  const now = new Date();

  const existingSource = await db.candidateStudioSource.findUnique({
    where: {
      provider_sourceKey: {
        provider: record.provider,
        sourceKey: record.sourceKey,
      },
    },
    select: {
      id: true,
      candidateStudioId: true,
    },
  });

  if (existingSource) {
    await db.$transaction([
      db.candidateStudioSource.update({
        where: { id: existingSource.id },
        data: {
          externalId: record.externalId,
          sourceUrl: record.sourceUrl,
          providerCategory: record.providerCategory,
          attribution: record.attribution,
          licenseUrl: record.licenseUrl,
          active: true,
          lastCheckedAt: now,
        },
      }),
      db.candidateStudio.update({
        where: { id: existingSource.candidateStudioId },
        data: {
          lastSeenAt: now,
          lastCheckedAt: now,
        },
      }),
    ]);

    return {
      outcome: "REFRESHED",
      candidateId: existingSource.candidateStudioId,
      sourceKey: record.sourceKey,
    };
  }

  const shortlist = await db.candidateStudio.findMany({
    where: shortlistWhere(record),
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      id: true,
      name: true,
      normalizedName: true,
      category: true,
      countryCode: true,
      city: true,
      district: true,
      postalCode: true,
      address: true,
      latitude: true,
      longitude: true,
      phone: true,
      website: true,
      instagram: true,
    },
  });

  const match = chooseDedupMatch(
    {
      name: record.name,
      normalizedName: record.normalizedName,
      category: record.category,
      countryCode: record.countryCode,
      city: record.city,
      district: record.district,
      postalCode: record.postalCode,
      address: record.address,
      latitude: record.latitude,
      longitude: record.longitude,
      phone: record.phone,
      website: record.website,
      instagram: record.instagram,
    },
    shortlist.map(candidateForDedup),
  );

  if (match.decision === "AUTO_MATCH" && match.candidateId) {
    try {
      await db.$transaction(async (tx) => {
        await createSource(tx, match.candidateId!, record, now);
        await tx.candidateStudio.update({
          where: { id: match.candidateId! },
          data: {
            lastSeenAt: now,
            lastCheckedAt: now,
          },
        });
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const raced = await db.candidateStudioSource.findUnique({
          where: {
            provider_sourceKey: {
              provider: record.provider,
              sourceKey: record.sourceKey,
            },
          },
          select: { candidateStudioId: true },
        });

        if (raced) {
          return {
            outcome: "REFRESHED",
            candidateId: raced.candidateStudioId,
            sourceKey: record.sourceKey,
          };
        }
      }

      throw error;
    }

    return {
      outcome: "AUTO_MATCHED",
      candidateId: match.candidateId,
      sourceKey: record.sourceKey,
    };
  }

  const candidate = await db.$transaction(async (tx) => {
    const created = await tx.candidateStudio.create({
      data: {
        name: record.name,
        normalizedName: record.normalizedName,
        slug: candidateSlug(record),
        category: record.category,
        status: CandidateStudioStatus.DISCOVERED,
        countryCode: record.countryCode,
        country: record.country,
        region: record.region,
        city: record.city,
        district: record.district,
        postalCode: record.postalCode,
        address: record.address,
        latitude: record.latitude,
        longitude: record.longitude,
        phone: record.phone,
        email: record.email,
        website: record.website,
        instagram: record.instagram,
        firstSeenAt: now,
        lastSeenAt: now,
        lastCheckedAt: now,
      },
      select: { id: true },
    });

    await createSource(tx, created.id, record, now);
    return created;
  });

  if (match.decision === "REVIEW") {
    await transitionCandidateStudio({
      candidateId: candidate.id,
      toStatus: CandidateStudioStatus.REVIEW_REQUIRED,
      actor: CandidateStudioTransitionActor.SYSTEM,
      reasonCode: "DEDUP_REVIEW_REQUIRED",
      metadata: {
        source: sourceMetadata(record),
        proposedMatchCandidateId: match.candidateId,
        ambiguousCandidateIds: match.ambiguousCandidateIds,
        evaluation: match.evaluation
          ? {
              decision: match.evaluation.decision,
              score: match.evaluation.score,
              reasons: match.evaluation.reasons,
              conflicts: match.evaluation.conflicts,
              strongIdentityMatches: match.evaluation.strongIdentityMatches,
              nameSimilarity: match.evaluation.nameSimilarity,
              addressSimilarity: match.evaluation.addressSimilarity,
              distanceMeters: match.evaluation.distanceMeters,
            }
          : null,
      },
    });

    return {
      outcome: "CREATED_REVIEW",
      candidateId: candidate.id,
      sourceKey: record.sourceKey,
    };
  }

  if (record.issues.length > 0) {
    await transitionCandidateStudio({
      candidateId: candidate.id,
      toStatus: CandidateStudioStatus.REVIEW_REQUIRED,
      actor: CandidateStudioTransitionActor.SYSTEM,
      reasonCode: "NORMALIZATION_REVIEW_REQUIRED",
      metadata: {
        source: sourceMetadata(record),
        issues: record.issues,
      },
    });

    return {
      outcome: "CREATED_REVIEW",
      candidateId: candidate.id,
      sourceKey: record.sourceKey,
    };
  }

  await transitionCandidateStudio({
    candidateId: candidate.id,
    toStatus: CandidateStudioStatus.ENRICHED,
    actor: CandidateStudioTransitionActor.SYSTEM,
    reasonCode: "PROVIDER_NORMALIZED",
    metadata: {
      source: sourceMetadata(record),
    },
  });

  return {
    outcome: "CREATED_ENRICHED",
    candidateId: candidate.id,
    sourceKey: record.sourceKey,
  };
}

export async function ingestOpenStreetMapStudio(
  record: OpenStreetMapStudioRecord,
): Promise<DiscoveryIngestResult> {
  return ingestDiscoveryStudio({
    provider: record.provider,
    sourceKey: record.sourceKey,
    externalId: record.externalId,
    sourceUrl: record.sourceUrl,
    providerCategory: record.providerCategory,
    attribution: record.attribution,
    licenseUrl: record.licenseUrl,
    name: record.name,
    normalizedName: record.normalizedName,
    category: record.category,
    categoryConfidence: record.categoryConfidence,
    categoryEvidence: record.categoryEvidence,
    categoryAlternatives: record.categoryAlternatives,
    countryCode: record.countryCode,
    country: record.country,
    region: record.region,
    city: record.city,
    district: record.district,
    postalCode: record.postalCode,
    address: record.address,
    latitude: record.latitude,
    longitude: record.longitude,
    phone: record.phone,
    email: record.email,
    website: record.website,
    instagram: record.instagram,
    issues: record.issues,
    slugHint: `${record.osmType}-${record.osmId}`,
    metadata: {
      osmTimestamp: record.osmTimestamp,
      tags: record.tags,
    },
  });
}
