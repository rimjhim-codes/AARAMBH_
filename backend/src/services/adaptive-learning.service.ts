import { SkillGapModel, LearningRecommendationModel } from "../models/sih/SihModels";
import { getUnifiedLearningHistory, type LearningHistoryItem } from "./learning-history.service";

export const ADAPTIVE_BANDS = ["insufficient_evidence", "struggling", "developing", "proficient", "strong"] as const;
export type AdaptivePerformanceBand = (typeof ADAPTIVE_BANDS)[number];
export const ADAPTIVE_ACTIONS = ["review", "practice", "reassess", "continue", "progress", "challenge"] as const;
export type AdaptiveAction = (typeof ADAPTIVE_ACTIONS)[number];
export const ADAPTIVE_DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type AdaptiveDifficulty = (typeof ADAPTIVE_DIFFICULTIES)[number];

export type MasterySignals = {
  scoredEvidence: number;
  recentScores: number[];
  averageScore?: number;
  failedAttempts: number;
  successfulAttempts: number;
  retryCount: number;
  completedLearning: number;
  recentActivity: boolean;
};

export type AdaptiveDecision = {
  decision: AdaptiveAction;
  performanceBand: AdaptivePerformanceBand;
  reasonCodes: string[];
  reasonSummary: string;
  signals: MasterySignals;
  evidence: Array<{ source: string; status: string; score?: number; title: string }>;
  currentDifficulty?: AdaptiveDifficulty;
  recommendedDifficulty?: AdaptiveDifficulty;
  confidence: "low" | "medium" | "high";
  fallbackUsed: boolean;
  resource?: Record<string, unknown>;
};

const difficultyRank: Record<AdaptiveDifficulty, number> = { beginner: 0, intermediate: 1, advanced: 2 };

function validDifficulty(value: unknown): AdaptiveDifficulty | undefined {
  return ADAPTIVE_DIFFICULTIES.includes(String(value || "") as AdaptiveDifficulty)
    ? String(value) as AdaptiveDifficulty
    : undefined;
}

function scoredItems(history: LearningHistoryItem[]) {
  return history
    .filter((item) => typeof item.score === "number" && ["quiz", "assessment", "virtual_lab", "learning_outcome"].includes(item.source))
    .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime());
}

export function buildMasterySignals(history: LearningHistoryItem[]): MasterySignals {
  const scored = scoredItems(history);
  const recentScores = scored.slice(0, 5).map((item) => Number(item.score));
  const failedAttempts = history.filter((item) => item.status === "failed").length;
  const successfulAttempts = history.filter((item) => ["passed", "completed"].includes(item.status) && typeof item.score === "number").length;
  const retryCount = history.filter((item) => item.source === "virtual_lab" && item.metadata?.attemptNumber !== undefined).length;
  const completedLearning = history.filter((item) => item.status === "completed" || item.status === "passed").length;
  return {
    scoredEvidence: scored.length,
    recentScores,
    averageScore: recentScores.length ? Math.round(recentScores.reduce((sum, score) => sum + score, 0) / recentScores.length) : undefined,
    failedAttempts,
    successfulAttempts,
    retryCount,
    completedLearning,
    recentActivity: history.length > 0
  };
}

export function classifyPerformance(signals: MasterySignals): AdaptivePerformanceBand {
  if (!signals.scoredEvidence) return signals.failedAttempts ? "struggling" : "insufficient_evidence";
  const average = signals.averageScore || 0;
  const lastTwo = signals.recentScores.slice(0, 2);
  const repeatedLow = lastTwo.length === 2 && lastTwo.reduce((sum, score) => sum + score, 0) / 2 < 55;
  if (average < 50 || signals.failedAttempts >= 2 || repeatedLow) return "struggling";
  if (signals.scoredEvidence >= 2 && average >= 85 && signals.failedAttempts === 0) return "strong";
  if (signals.scoredEvidence >= 2 && average >= 70 && signals.failedAttempts <= 1) return "proficient";
  return "developing";
}

export function chooseAdaptiveAction(band: AdaptivePerformanceBand, signals: MasterySignals, hasGap: boolean): AdaptiveAction {
  if (band === "insufficient_evidence") return hasGap ? "review" : "continue";
  if (band === "struggling") return signals.failedAttempts > 0 ? "practice" : "review";
  if (band === "developing") return hasGap && signals.scoredEvidence >= 2 ? "reassess" : hasGap ? "practice" : "continue";
  if (band === "proficient") return "progress";
  return "challenge";
}

export function adaptDifficulty(current: AdaptiveDifficulty | undefined, band: AdaptivePerformanceBand): AdaptiveDifficulty | undefined {
  if (!current) return undefined;
  const currentRank = difficultyRank[current];
  if (band === "struggling") return ADAPTIVE_DIFFICULTIES[Math.max(0, currentRank - 1)];
  if (band === "proficient" || band === "strong") return ADAPTIVE_DIFFICULTIES[Math.min(2, currentRank + 1)];
  return current;
}

function currentDifficultyFromHistory(history: LearningHistoryItem[]) {
  for (const item of history) {
    const metadata = item.metadata || {};
    const candidate = validDifficulty(metadata.difficulty || metadata.category);
    if (candidate) return candidate;
  }
  return undefined;
}

function reasonSummary(action: AdaptiveAction, band: AdaptivePerformanceBand, signals: MasterySignals) {
  if (band === "insufficient_evidence") return action === "review" ? "There is a competency gap but not enough scored evidence to progress safely." : "More learning evidence is needed before adapting difficulty.";
  if (band === "struggling") return `Recent evidence indicates difficulty${signals.failedAttempts ? " and failed attempts" : ""}; reinforce the fundamentals before progressing.`;
  if (band === "developing") return action === "reassess" ? "Performance is developing; reassess the targeted competency after focused practice." : "Continue targeted practice while building consistent evidence.";
  if (band === "proficient") return "Recent repeated evidence supports progression to the next controlled difficulty.";
  return "Strong recent repeated evidence supports an advanced challenge.";
}

function candidateDifficulty(candidate: any) {
  return validDifficulty(candidate?.difficulty);
}

function safeCandidate(candidate: any, adaptiveScore: number, recommendedDifficulty?: AdaptiveDifficulty) {
  return {
    id: String(candidate._id || candidate.externalId || ""),
    title: candidate.title,
    description: candidate.description || "",
    source: candidate.source,
    externalId: candidate.externalId,
    competencyId: candidate.competencyId,
    difficulty: candidateDifficulty(candidate),
    recommendedDifficulty,
    relevanceScore: candidate.relevanceScore,
    adaptiveScore: Math.round(adaptiveScore),
    courseUrl: candidate.courseUrl || "",
    reasonSummary: candidate.reasonSummary || candidate.whyRecommended || "Existing recommendation aligned with a recorded gap."
  };
}

export async function getNextAdaptiveLearningDecision(userId: string, competencyId?: string): Promise<AdaptiveDecision> {
  const [{ items: history }, gaps, recommendations] = await Promise.all([
    getUnifiedLearningHistory(userId, { page: 1, limit: 50 }),
    SkillGapModel.find({ userId, gap: { $gt: 0 }, ...(competencyId ? { competencyId } : {}) }).sort({ gap: -1 }).limit(8).lean(),
    LearningRecommendationModel.find({ userId, status: { $in: ["recommended", "enrolled", "in_progress"] }, ...(competencyId ? { competencyId } : {}) }).sort({ priority: -1, pathStep: 1 }).limit(50).lean()
  ]);

  const signals = buildMasterySignals(history);
  const band = classifyPerformance(signals);
  const gap = gaps[0] as any;
  const hasGap = Boolean(gap);
  const decision = chooseAdaptiveAction(band, signals, hasGap);
  const reasonCodes: string[] = [];
  if (band === "insufficient_evidence") reasonCodes.push("insufficient_evidence");
  if (band === "struggling") reasonCodes.push(signals.failedAttempts ? "failed_lab_attempt" : "repeated_low_quiz_score");
  if (band === "developing" && signals.recentScores.length >= 2) reasonCodes.push("improving_performance");
  if (band === "strong") reasonCodes.push("strong_recent_performance");
  if (hasGap) reasonCodes.push("competency_gap");
  if (signals.retryCount > 1) reasonCodes.push("repeated_retry");
  if (signals.completedLearning > 0) reasonCodes.push("completed_learning");
  if (signals.recentActivity) reasonCodes.push("recent_activity");

  const recentEvidence = scoredItems(history).slice(0, 5).map((item) => ({ source: item.source, status: item.status, score: item.score, title: item.title }));
  const currentDifficulty = currentDifficultyFromHistory(history);
  const recommendedDifficulty = adaptDifficulty(currentDifficulty, band);
  const fallbackReasons: string[] = [];
  let candidateRows = recommendations.filter((candidate: any) => !competencyId || String(candidate.competencyId) === competencyId);
  if (!candidateRows.length) fallbackReasons.push("no_adaptive_resource");

  const scoredCandidates = candidateRows.map((candidate: any) => {
    const difficulty = candidateDifficulty(candidate);
    let score = Number(candidate.relevanceScore || candidate.priority || 0);
    if (!difficulty || !recommendedDifficulty) {
      if (!difficulty) fallbackReasons.push("missing_difficulty_metadata");
    } else if (difficultyRank[difficulty] > difficultyRank[recommendedDifficulty]) {
      score -= band === "struggling" || band === "developing" ? 20 : 5;
    } else {
      score += band === "strong" && difficulty === "advanced" ? 12 : band === "struggling" && difficulty === "beginner" ? 12 : 4;
    }
    return { candidate, score, difficulty };
  }).sort((left, right) => right.score - left.score);

  const selected = scoredCandidates.find(({ difficulty }) => !recommendedDifficulty || !difficulty || difficultyRank[difficulty] <= difficultyRank[recommendedDifficulty]) || scoredCandidates[0];
  const fallbackUsed = fallbackReasons.length > 0 || !selected || band === "insufficient_evidence";
  if (fallbackUsed) reasonCodes.push(...fallbackReasons, ...(band === "insufficient_evidence" ? ["safe_default_action"] : []));
  const confidence = band === "strong" || band === "proficient" ? "high" : band === "developing" ? "medium" : "low";
  return {
    decision,
    performanceBand: band,
    reasonCodes: [...new Set(reasonCodes)],
    reasonSummary: reasonSummary(decision, band, signals),
    signals,
    evidence: recentEvidence,
    currentDifficulty,
    recommendedDifficulty: selected?.difficulty || recommendedDifficulty,
    confidence,
    fallbackUsed,
    resource: selected ? safeCandidate(selected.candidate, selected.score, recommendedDifficulty || selected.difficulty) : undefined
  };
}
