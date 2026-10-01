export type CreativeSpaceCategoryKey =
  | "RECORDING"
  | "PODCAST"
  | "PHOTO"
  | "VIDEO"
  | "REHEARSAL"
  | "DJ"
  | "PRODUCTION"
  | "IMAGE_LAB"
  | "VOICE_OVER"
  | "LIVE_STREAMING"
  | "POST_PRODUCTION"
  | "OTHER";

export type CreativeClassification = {
  key: CreativeSpaceCategoryKey;
  confidence: "HIGH" | "MEDIUM" | "LOW";
  evidence: string[];
};

type Input = {
  name?: string | null;
  storedCategory?: string | null;
  providerCategories?: Array<string | null | undefined>;
  services?: Array<string | null | undefined>;
};

type Rule = {
  key: CreativeSpaceCategoryKey;
  phrases: readonly string[];
  specificity: number;
};

const RULES: readonly Rule[] = [
  {
    key: "IMAGE_LAB",
    specificity: 95,
    phrases: [
      "photo lab",
      "photo laboratory",
      "photographic lab",
      "photographic laboratory",
      "labo photo",
      "laboratoire photo",
      "laboratoire photographique",
      "darkroom",
      "dark room",
      "film processing",
      "film development",
      "photo processing",
      "photo developing",
      "photofinishing",
      "mini lab",
      "minilab",
      "developpement photo",
      "developement photo",
      "tirage photo",
      "labo",
    ],
  },
  {
    key: "PODCAST",
    specificity: 90,
    phrases: [
      "podcast",
      "podcasting",
      "podcast studio",
      "podcast room",
      "studio podcast",
    ],
  },
  {
    key: "VOICE_OVER",
    specificity: 88,
    phrases: [
      "voice over",
      "voiceover",
      "voice studio",
      "voice recording",
      "dubbing",
      "narration studio",
      "studio voix",
      "doublage",
    ],
  },
  {
    key: "LIVE_STREAMING",
    specificity: 86,
    phrases: [
      "live streaming",
      "livestream",
      "live stream",
      "streaming studio",
      "broadcast studio",
    ],
  },
  {
    key: "REHEARSAL",
    specificity: 84,
    phrases: [
      "rehearsal",
      "rehearsal studio",
      "rehearsal room",
      "practice room",
      "band practice",
      "music rehearsal",
      "salle de repetition",
      "local de repetition",
      "studio de repetition",
      "sala de ensayo",
      "local de ensayo",
    ],
  },
  {
    key: "POST_PRODUCTION",
    specificity: 82,
    phrases: [
      "post production",
      "postproduction",
      "color grading",
      "colour grading",
      "video editing",
      "editing suite",
      "montage video",
      "postprod",
    ],
  },
  {
    key: "RECORDING",
    specificity: 80,
    phrases: [
      "recording studio",
      "recording",
      "audio recording",
      "sound recording",
      "music recording",
      "audio studio",
      "studio audio",
      "sound studio",
      "studio sound",
      "studio son",
      "studio sonore",
      "studio d enregistrement",
      "enregistrement",
      "mixing studio",
      "mastering studio",
      "radio studio",
    ],
  },
  {
    key: "VIDEO",
    specificity: 72,
    phrases: [
      "video studio",
      "film studio",
      "television studio",
      "tv studio",
      "video production",
      "production video",
      "videography",
      "audiovisual",
      "audiovisuel",
      "production audiovisuelle",
    ],
  },
  {
    key: "PHOTO",
    specificity: 70,
    phrases: [
      "photo studio",
      "photography studio",
      "photographic studio",
      "studio photo",
      "portrait studio",
      "event photography service",
      "photography class",
      "photography service",
      "photographe",
      "fotografia",
      "estudio fotografico",
      "studio fotografico",
    ],
  },
  {
    key: "DJ",
    specificity: 68,
    phrases: [
      "dj studio",
      "deejay studio",
      "dj rehearsal",
      "dj room",
    ],
  },
  {
    key: "PRODUCTION",
    specificity: 60,
    phrases: [
      "music production",
      "production studio",
      "studio production",
      "producer studio",
      "beatmaking",
      "beat making",
      "beat studio",
      "record label",
      "music producer",
    ],
  },
];

const MORE_KEYS = new Set<CreativeSpaceCategoryKey>([
  "DJ",
  "PRODUCTION",
  "POST_PRODUCTION",
  "LIVE_STREAMING",
  "OTHER",
]);

function normalize(value: string | null | undefined) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[’'\u2018\u2019]/g, " ")
    .replace(/[_/|,+&()\-]+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPhrase(text: string, rawPhrase: string) {
  const phrase = normalize(rawPhrase);
  if (!text || !phrase) return false;
  return (" " + text + " ").includes(" " + phrase + " ");
}

export function classifyCreativeSpace(input: Input): CreativeClassification {
  const sources: Array<{ label: string; text: string; weight: number }> = [];

  const name = normalize(input.name);
  if (name) sources.push({ label: "name", text: name, weight: 115 });

  for (const value of input.services || []) {
    const text = normalize(value);
    if (text) sources.push({ label: "service", text, weight: 105 });
  }

  for (const value of input.providerCategories || []) {
    const text = normalize(value);
    if (text) sources.push({ label: "provider", text, weight: 92 });
  }

  const scores = new Map<CreativeSpaceCategoryKey, number>();
  const evidence = new Map<CreativeSpaceCategoryKey, string[]>();

  for (const source of sources) {
    for (const rule of RULES) {
      for (const phrase of rule.phrases) {
        if (!hasPhrase(source.text, phrase)) continue;
        const score =
          source.weight +
          rule.specificity +
          Math.min(normalize(phrase).length, 28);
        scores.set(rule.key, Math.max(scores.get(rule.key) || 0, score));
        const list = evidence.get(rule.key) || [];
        const item = source.label + ":" + phrase;
        if (!list.includes(item)) list.push(item);
        evidence.set(rule.key, list);
      }
    }
  }

  const stored = String(input.storedCategory || "").toUpperCase() as CreativeSpaceCategoryKey;
  if (
    [
      "RECORDING",
      "PODCAST",
      "PHOTO",
      "VIDEO",
      "REHEARSAL",
      "DJ",
      "PRODUCTION",
      "VOICE_OVER",
      "LIVE_STREAMING",
      "POST_PRODUCTION",
      "OTHER",
    ].includes(stored)
  ) {
    const storedScore = stored === "OTHER" ? 12 : 52;
    scores.set(stored, Math.max(scores.get(stored) || 0, storedScore));
    const list = evidence.get(stored) || [];
    list.push("stored:" + stored);
    evidence.set(stored, list);
  }

  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  if (!ranked.length) {
    return { key: "OTHER", confidence: "LOW", evidence: [] };
  }

  const [key, score] = ranked[0];
  const second = ranked[1]?.[1] || 0;
  const confidence =
    score >= 200 && score - second >= 20
      ? "HIGH"
      : score >= 145
        ? "MEDIUM"
        : "LOW";

  return {
    key,
    confidence,
    evidence: evidence.get(key) || [],
  };
}

export function matchesCreativeCategory(
  key: CreativeSpaceCategoryKey,
  filter: string | null | undefined,
) {
  const normalizedFilter = String(filter || "").toUpperCase();
  if (!normalizedFilter) return true;
  if (normalizedFilter === "OTHER") return MORE_KEYS.has(key);
  return key === normalizedFilter;
}

export function creativeCategoryLabel(key: CreativeSpaceCategoryKey) {
  const labels: Record<CreativeSpaceCategoryKey, string> = {
    RECORDING: "Recording",
    PODCAST: "Podcast",
    PHOTO: "Photo",
    VIDEO: "Video",
    REHEARSAL: "Rehearsal",
    DJ: "DJ",
    PRODUCTION: "Production",
    IMAGE_LAB: "Image Lab",
    VOICE_OVER: "Voice-over",
    LIVE_STREAMING: "Live streaming",
    POST_PRODUCTION: "Post-production",
    OTHER: "Other creative space",
  };
  return labels[key];
}
