export type EducationalClassification =
  | "EDUCATIONAL"
  | "PARTIALLY_EDUCATIONAL"
  | "NON_EDUCATIONAL";

export interface EducationalInsight {
  classification: EducationalClassification;
  confidence: number;
  reasoning: string;
}

export type ClientTier = "full" | "partial" | "minimal";

export const SOFT_EDUCATIONAL_WARNING =
  "This content may not be strongly educational. Some AI learning features could be limited.";

/** Mirrors backend `resolveEffectiveTier` for UI affordances. */
export function clientEffectiveTier(insight: EducationalInsight | null | undefined): ClientTier {
  if (!insight) return "full";
  if (insight.classification === "EDUCATIONAL") return "full";
  const lowConfidence = insight.confidence < 45;
  if (insight.classification === "PARTIALLY_EDUCATIONAL" && !lowConfidence) return "partial";
  return "minimal";
}

export function insightBadgeLabel(insight: EducationalInsight): string {
  switch (insight.classification) {
    case "EDUCATIONAL":
      return "Educational";
    case "PARTIALLY_EDUCATIONAL":
      return "Partially educational";
    case "NON_EDUCATIONAL":
      return "Low learning signal";
    default:
      return "Unknown";
  }
}

export function tierAllows(
  tier: ClientTier,
  feature: "tutor" | "quiz" | "reco" | "flashcards" | "adaptive" | "revision"
): boolean {
  if (tier === "full") return true;
  if (tier === "partial") {
    return feature === "tutor";
  }
  return false;
}
