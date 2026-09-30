import type { Prisma } from "@prisma/client";

import { normalizeSearchText } from "@/lib/discovery/normalization";

const STUDIO_NAME_SIGNALS = [
  "studio",
  "estudio",
  "recording",
  "rehearsal",
  "podcast",
  "mixing",
  "mastering",
  "voice over",
  "voiceover",
  "grabacion",
  "enregistrement",
  "tonstudio",
  "fotostudio",
  "aufnahmestudio",
  "студия",
  "звукозапис",
  "استوديو",
  "تسجيل",
  "スタジオ",
  "レコーディング",
  "스튜디오",
  "녹음",
  "录音棚",
  "录音室",
  "錄音室",
  "摄影棚",
  "攝影棚",
] as const;

function normalizedSignals() {
  return [...new Set(STUDIO_NAME_SIGNALS.map((value) => normalizeSearchText(value)).filter(Boolean))];
}

export function hasDirectoryStudioNameSignal(name: string | null | undefined) {
  const normalized = normalizeSearchText(name);
  if (!normalized) return false;
  return normalizedSignals().some((signal) => normalized.includes(signal));
}

export function hasDirectoryStudioTaxonomySignal(
  providerCategories: Array<string | null | undefined>,
) {
  return providerCategories.some((value) => {
    const normalized = normalizeSearchText(value);
    return Boolean(normalized && normalized.includes("studio"));
  });
}

export function isDirectoryStudioIdentity(input: {
  name: string | null | undefined;
  providerCategories?: Array<string | null | undefined>;
}) {
  return (
    hasDirectoryStudioNameSignal(input.name) ||
    hasDirectoryStudioTaxonomySignal(input.providerCategories || [])
  );
}

export function directoryStudioIdentityWhere(): Prisma.CandidateStudioWhereInput {
  const signals = normalizedSignals();

  return {
    OR: [
      ...signals.map((signal) => ({
        normalizedName: {
          contains: signal,
          mode: "insensitive" as const,
        },
      })),
      {
        sources: {
          some: {
            active: true,
            providerCategory: {
              contains: "studio",
              mode: "insensitive" as const,
            },
          },
        },
      },
    ],
  };
}
