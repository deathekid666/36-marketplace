import {
  CandidateStudioStatus,
  CandidateStudioTransitionActor,
  DiscoveryStudioCategory,
  Prisma,
} from "@prisma/client";

import { db } from "@/lib/db";
import {
  buildCandidateBlockingKeys,
  evaluateDedupCandidate,
  type DedupCandidate,
  type DedupEvaluation,
} from "@/lib/discovery/deduplication";

type ConsolidationCandidate = {
  id: string;
  name: string;
  normalizedName: string;
  slug: string;
  category: DiscoveryStudioCategory;
  status: CandidateStudioStatus;
  countryCode: string | null;
  country: string | null;
  region: string | null;
  city: string | null;
  district: string | null;
  postalCode: string | null;
  address: string | null;
  latitude: Prisma.Decimal | null;
  longitude: Prisma.Decimal | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  instagram: string | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  lastCheckedAt: Date | null;
  createdAt: Date;
  _count: { sources: number };
};

export type ConsolidationResult = {
  scanned: number;
  proposals: number;
  merged: number;
  merges: Array<{
    primaryId: string;
    secondaryId: string;
    score: number;
    reasons: string[];
  }>;
};

function decimalNumber(value: Prisma.Decimal | null) {
  return value == null ? null : Number(value.toString());
}

function asDedup(candidate: ConsolidationCandidate): DedupCandidate {
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

function richness(candidate: ConsolidationCandidate) {
  let score = candidate.status === CandidateStudioStatus.APPROVED ? 50 : 0;
  score += Math.min(30, candidate._count.sources * 6);
  if (candidate.phone) score += 8;
  if (candidate.website) score += 7;
  if (candidate.email) score += 6;
  if (candidate.instagram) score += 5;
  if (candidate.address) score += 4;
  if (candidate.latitude != null && candidate.longitude != null) score += 3;
  return score;
}

function choosePrimary(
  left: ConsolidationCandidate,
  right: ConsolidationCandidate,
) {
  const leftScore = richness(left);
  const rightScore = richness(right);
  if (leftScore !== rightScore) return leftScore > rightScore ? left : right;

  if (left.createdAt.getTime() !== right.createdAt.getTime()) {
    return left.createdAt < right.createdAt ? left : right;
  }

  return left.id.localeCompare(right.id) <= 0 ? left : right;
}

function maxDate(left: Date | null, right: Date | null) {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function minDate(left: Date, right: Date) {
  return left < right ? left : right;
}

function hasStrongIdentity(evaluation: DedupEvaluation) {
  return evaluation.strongIdentityMatches >= 1;
}

function pairKey(left: string, right: string) {
  return left < right ? left + ":" + right : right + ":" + left;
}

export async function consolidateSafeDiscoveryDuplicates(
  maxMerges = 12,
): Promise<ConsolidationResult> {
  const mergeLimit = Math.max(1, Math.min(40, Math.floor(maxMerges)));

  const candidates = await db.candidateStudio.findMany({
    where: {
      status: { in: [CandidateStudioStatus.ENRICHED, CandidateStudioStatus.APPROVED] },
      convertedStudioId: null,
      claims: { none: {} },
    },
    select: {
      id: true,
      name: true,
      normalizedName: true,
      slug: true,
      category: true,
      status: true,
      countryCode: true,
      country: true,
      region: true,
      city: true,
      district: true,
      postalCode: true,
      address: true,
      latitude: true,
      longitude: true,
      phone: true,
      email: true,
      website: true,
      instagram: true,
      firstSeenAt: true,
      lastSeenAt: true,
      lastCheckedAt: true,
      createdAt: true,
      _count: { select: { sources: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 10_000,
  });

  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const blocks = new Map<string, string[]>();

  for (const candidate of candidates) {
    for (const key of buildCandidateBlockingKeys(asDedup(candidate))) {
      const list = blocks.get(key) || [];
      list.push(candidate.id);
      blocks.set(key, list);
    }
  }

  const pairIds = new Set<string>();
  for (const ids of blocks.values()) {
    if (ids.length < 2 || ids.length > 40) continue;
    for (let leftIndex = 0; leftIndex < ids.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < ids.length; rightIndex += 1) {
        pairIds.add(pairKey(ids[leftIndex], ids[rightIndex]));
      }
    }
  }

  const proposals: Array<{
    left: ConsolidationCandidate;
    right: ConsolidationCandidate;
    evaluation: DedupEvaluation;
  }> = [];

  for (const key of pairIds) {
    const separator = key.indexOf(":");
    const left = byId.get(key.slice(0, separator));
    const right = byId.get(key.slice(separator + 1));
    if (!left || !right) continue;

    if (
      !left.countryCode ||
      !right.countryCode ||
      left.countryCode !== right.countryCode
    ) {
      continue;
    }

    const evaluation = evaluateDedupCandidate(asDedup(left), asDedup(right));
    if (
      evaluation.decision === "AUTO_MATCH" &&
      hasStrongIdentity(evaluation)
    ) {
      proposals.push({ left, right, evaluation });
    }
  }

  proposals.sort((a, b) => b.evaluation.score - a.evaluation.score);

  const used = new Set<string>();
  const merges: ConsolidationResult["merges"] = [];

  for (const proposal of proposals) {
    if (merges.length >= mergeLimit) break;
    if (used.has(proposal.left.id) || used.has(proposal.right.id)) continue;

    const primary = choosePrimary(proposal.left, proposal.right);
    const secondary = primary.id === proposal.left.id ? proposal.right : proposal.left;

    const merged = await db.$transaction(async (tx) => {
      const rows = await tx.candidateStudio.findMany({
        where: { id: { in: [primary.id, secondary.id] } },
        select: {
          id: true,
          status: true,
          convertedStudioId: true,
          name: true,
          category: true,
          countryCode: true,
          country: true,
          region: true,
          city: true,
          district: true,
          postalCode: true,
          address: true,
          latitude: true,
          longitude: true,
          phone: true,
          email: true,
          website: true,
          instagram: true,
          firstSeenAt: true,
          lastSeenAt: true,
          lastCheckedAt: true,
          _count: { select: { claims: true } },
        },
      });

      if (rows.length !== 2) return false;
      const livePrimary = rows.find((row) => row.id === primary.id);
      const liveSecondary = rows.find((row) => row.id === secondary.id);
      if (!livePrimary || !liveSecondary) return false;

      const allowed = new Set<CandidateStudioStatus>([
        CandidateStudioStatus.ENRICHED,
        CandidateStudioStatus.APPROVED,
      ]);

      if (
        !allowed.has(livePrimary.status) ||
        !allowed.has(liveSecondary.status) ||
        livePrimary.convertedStudioId ||
        liveSecondary.convertedStudioId ||
        livePrimary._count.claims > 0 ||
        liveSecondary._count.claims > 0
      ) {
        return false;
      }

      const nextStatus =
        livePrimary.status === CandidateStudioStatus.APPROVED ||
        liveSecondary.status === CandidateStudioStatus.APPROVED
          ? CandidateStudioStatus.APPROVED
          : CandidateStudioStatus.ENRICHED;

      await tx.candidateStudioSource.updateMany({
        where: { candidateStudioId: secondary.id },
        data: { candidateStudioId: primary.id },
      });

      await tx.candidateStudioTransition.updateMany({
        where: { candidateStudioId: secondary.id },
        data: { candidateStudioId: primary.id },
      });

      await tx.candidateStudio.update({
        where: { id: primary.id },
        data: {
          status: nextStatus,
          category:
            livePrimary.category === DiscoveryStudioCategory.OTHER
              ? liveSecondary.category
              : livePrimary.category,
          countryCode: livePrimary.countryCode || liveSecondary.countryCode,
          country: livePrimary.country || liveSecondary.country,
          region: livePrimary.region || liveSecondary.region,
          city: livePrimary.city || liveSecondary.city,
          district: livePrimary.district || liveSecondary.district,
          postalCode: livePrimary.postalCode || liveSecondary.postalCode,
          address: livePrimary.address || liveSecondary.address,
          latitude: livePrimary.latitude || liveSecondary.latitude,
          longitude: livePrimary.longitude || liveSecondary.longitude,
          phone: livePrimary.phone || liveSecondary.phone,
          email: livePrimary.email || liveSecondary.email,
          website: livePrimary.website || liveSecondary.website,
          instagram: livePrimary.instagram || liveSecondary.instagram,
          firstSeenAt: minDate(livePrimary.firstSeenAt, liveSecondary.firstSeenAt),
          lastSeenAt: maxDate(livePrimary.lastSeenAt, liveSecondary.lastSeenAt)!,
          lastCheckedAt: maxDate(
            livePrimary.lastCheckedAt,
            liveSecondary.lastCheckedAt,
          ),
        },
      });

      await tx.candidateStudioTransition.create({
        data: {
          candidateStudioId: primary.id,
          fromStatus: livePrimary.status,
          toStatus: nextStatus,
          actor: CandidateStudioTransitionActor.SYSTEM,
          reasonCode: "DUPLICATE_AUTO_MERGED",
          note: "Conservative duplicate consolidation merged an unclaimed discovery record.",
          metadata: {
            secondaryCandidateId: secondary.id,
            secondarySlug: secondary.slug,
            score: proposal.evaluation.score,
            reasons: proposal.evaluation.reasons,
            conflicts: proposal.evaluation.conflicts,
            distanceMeters: proposal.evaluation.distanceMeters,
          },
        },
      });

      await tx.candidateStudio.delete({ where: { id: secondary.id } });
      return true;
    });

    if (!merged) continue;

    used.add(primary.id);
    used.add(secondary.id);
    merges.push({
      primaryId: primary.id,
      secondaryId: secondary.id,
      score: proposal.evaluation.score,
      reasons: proposal.evaluation.reasons,
    });
  }

  return {
    scanned: candidates.length,
    proposals: proposals.length,
    merged: merges.length,
    merges,
  };
}
