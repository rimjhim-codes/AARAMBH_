import { LearningOutcomeEventModel } from "../models/LearningOutcomeEvent";
import { CompetencyScoreModel } from "../models/sih/SihModels";
import {
  getUnifiedLearningHistory,
  type LearningHistoryItem,
  type LearningHistorySource
} from "./learning-history.service";
import {
  createAnalyticsDateRange,
  normalizeAnalyticsStatus,
  normalizeAnalyticsSource,
  type AnalyticsDateRangeInput,
  type AnalyticsSource
} from "./analytics-foundation.service";

export type LineageStrength = "direct" | "associated" | "unavailable";
export type LineageStatus = "complete" | "partial" | "unavailable";

export type EvidenceLineageCompetency = {
  competencyId: string;
  evidenceReference?: string;
  evidenceType?: string;
  evidenceTimestamp?: Date;
  scoreImpact?: number;
  competencyScoreId?: string;
  historyTimestamp?: Date;
  historySource?: string;
  frameworkId?: string;
  frameworkVersionId?: string;
  frameworkVersion?: string;
  proficiencyScale?: string;
  strength: LineageStrength;
};

export type EvidenceLineageItem = {
  id: string;
  source: AnalyticsSource;
  sourceId: string;
  resourceType?: string;
  resourceId?: string;
  title?: string;
  category?: string;
  status: string;
  progressReference?: string;
  outcomeId?: string;
  sourceEventId?: string;
  outcomeType?: string;
  outcomeSource?: string;
  outcomeTimestamp?: Date;
  validatedOutcome: boolean;
  competencyIds: string[];
  competencies: EvidenceLineageCompetency[];
  evidenceReference?: string;
  evidenceType?: string;
  evidenceTimestamp?: Date;
  frameworkId?: string;
  frameworkVersionId?: string;
  frameworkVersion?: string;
  proficiencyScale?: string;
  personalization?: {
    traceReference: string;
    affectedCompetencyIds: string[];
    affectedGapIds: string[];
    affectedRecommendationIds: string[];
    scope?: string;
    scopeFallback?: boolean;
    adaptive?: Record<string, unknown>;
  };
  lineageStrength: LineageStrength;
  lineageStatus: LineageStatus;
  limitation?: string;
  metadata?: Record<string, unknown>;
};

export type EvidenceLineageQuery = AnalyticsDateRangeInput & {
  source?: LearningHistorySource;
  resourceType?: string;
  resourceId?: string;
  limit?: number;
};

export type EvidenceLineageResult = {
  dateRange: ReturnType<typeof createAnalyticsDateRange>;
  items: EvidenceLineageItem[];
};

type OutcomeRecord = {
  eventId: string;
  userId: string;
  eventType: string;
  resourceType: string;
  resourceId: string;
  source: string;
  sourceEventId?: string;
  occurredAt: Date;
  status: string;
  competencyIds?: unknown[];
  outcomeScore?: number;
  metadata?: Record<string, any>;
  personalizationTrace?: Record<string, any>;
};

type ScoreRecord = {
  _id?: unknown;
  competencyId: unknown;
  frameworkId?: string;
  frameworkVersionId?: unknown;
  frameworkVersion?: string;
  proficiencyScale?: string;
  evidence?: Array<Record<string, any>>;
  history?: Array<Record<string, any>>;
};

function idOf(value: unknown) {
  return String(value || "");
}

function asDate(value: unknown) {
  if (value instanceof Date) return value;
  const parsed = new Date(String(value || ""));
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function sourceResourceKey(resourceType: string | undefined, resourceId: string | undefined) {
  const normalizedResource = String(resourceType || "").toLowerCase();
  const type = normalizedResource === "platform_course" ? "course"
    : normalizedResource === "igot_course" ? "course"
      : normalizedResource === "nssta_course" ? "training"
        : normalizedResource === "virtual_lab" ? "lab"
          : normalizedResource;
  // Source labels differ between enrollment records and canonical outcomes
  // (for example platform progress uses "platform" while the outcome uses
  // "arambh"). Resource identity is the stable correlation boundary here.
  return `${type}:${String(resourceId || "")}`;
}

function outcomeKey(outcome: OutcomeRecord) {
  return sourceResourceKey(outcome.resourceType, outcome.resourceId);
}

function historyOutcomeKey(item: LearningHistoryItem) {
  return sourceResourceKey(item.resourceType, item.resourceId);
}

function eventCompetencyIds(outcome: OutcomeRecord | undefined, item: LearningHistoryItem) {
  return [...new Set([
    ...((outcome?.competencyIds || []).map(idOf)),
    ...((item.competencyImpact || []).map((impact) => idOf(impact.competencyId)))
  ].filter(Boolean))];
}

function isValidatedOutcome(outcome: OutcomeRecord | undefined) {
  return Boolean(outcome
    && outcome.status === "processed"
    && outcome.eventType !== "learning.progressed"
    && ["assessment.completed", "quiz.completed", "lab.completed", "course.completed", "training.completed"].includes(outcome.eventType));
}

function historyEntryFor(score: ScoreRecord, timestamp: Date | undefined, source: string | undefined) {
  const entries = (score.history || [])
    .map((entry) => ({ ...entry, date: asDate(entry.date) }))
    .filter((entry) => entry.date) as Array<Record<string, any> & { date: Date }>;
  if (!entries.length) return undefined;
  return entries
    .filter((entry) => (!source || String(entry.source || "").toLowerCase().includes(source.toLowerCase()))
      && (!timestamp || entry.date.getTime() <= timestamp.getTime()))
    .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
}

function competencyLineage(
  competencyId: string,
  outcome: OutcomeRecord | undefined,
  item: LearningHistoryItem,
  score: ScoreRecord | undefined
): EvidenceLineageCompetency {
  const eventId = outcome?.eventId;
  const expectedKey = eventId ? `outcome:${eventId}:${competencyId}` : undefined;
  const evidence = expectedKey ? score?.evidence?.find((entry) => String(entry.key || "") === expectedKey) : undefined;
  const outcomeTimestamp = asDate(outcome?.occurredAt) || item.occurredAt;
  const sourceHint = outcome?.eventType === "assessment.completed" ? "assessment"
    : outcome?.eventType === "quiz.completed" ? "quiz"
      : outcome?.eventType === "lab.completed" ? "lab"
        : undefined;
  const history = score ? historyEntryFor(score, outcomeTimestamp, sourceHint) : undefined;
  const hasAssociatedHistory = Boolean(history && sourceHint);
  const strength: LineageStrength = evidence
    ? "direct"
    : hasAssociatedHistory ? "associated" : "unavailable";
  return {
    competencyId,
    ...(evidence?.key ? { evidenceReference: String(evidence.key) } : {}),
    ...(evidence?.type ? { evidenceType: String(evidence.type) } : sourceHint ? { evidenceType: sourceHint } : {}),
    ...(asDate(evidence?.at) ? { evidenceTimestamp: asDate(evidence?.at) } : {}),
    ...(typeof evidence?.scoreImpact === "number" ? { scoreImpact: evidence.scoreImpact } : {}),
    ...(score?._id ? { competencyScoreId: idOf(score._id) } : {}),
    ...(history?.date ? { historyTimestamp: history.date } : {}),
    ...(history?.source ? { historySource: String(history.source) } : {}),
    ...(score?.frameworkId ? { frameworkId: score.frameworkId } : {}),
    ...(score?.frameworkVersionId ? { frameworkVersionId: idOf(score.frameworkVersionId) } : {}),
    ...(score?.frameworkVersion ? { frameworkVersion: score.frameworkVersion } : {}),
    ...(score?.proficiencyScale ? { proficiencyScale: score.proficiencyScale } : {}),
    strength
  };
}

function personalizationFrom(outcome: OutcomeRecord | undefined) {
  const trace = outcome?.personalizationTrace;
  if (!trace || !trace.traceReference) return undefined;
  return {
    traceReference: String(trace.traceReference),
    affectedCompetencyIds: (trace.affectedCompetencyIds || []).map(idOf),
    affectedGapIds: (trace.gapIds || []).map(idOf),
    affectedRecommendationIds: (trace.recommendationIds || []).map(idOf),
    ...(trace.scope ? { scope: String(trace.scope) } : {}),
    ...(trace.scopeFallback !== undefined ? { scopeFallback: Boolean(trace.scopeFallback) } : {}),
    ...(trace.adaptive ? { adaptive: trace.adaptive as Record<string, unknown> } : {})
  };
}

function safeLineageMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return undefined;
  const allowed = ["title", "labTitle", "labCategory", "competencyCode", "category", "topic", "providerSource", "minutes", "lectureCount", "attemptNumber", "feedback"];
  const safe = Object.fromEntries(allowed
    .filter((key) => metadata[key] !== undefined)
    .map((key) => [key, metadata[key]]));
  return Object.keys(safe).length ? safe : undefined;
}

function buildLineageItem(
  item: LearningHistoryItem,
  outcome: OutcomeRecord | undefined,
  scores: Map<string, ScoreRecord>,
  progressReference?: string
): EvidenceLineageItem {
  const competencyIds = eventCompetencyIds(outcome, item);
  const competencies = competencyIds.map((id) => competencyLineage(id, outcome, item, scores.get(id)));
  const validatedOutcome = isValidatedOutcome(outcome);
  const direct = competencies.some((entry) => entry.strength === "direct");
  const associated = competencies.some((entry) => entry.strength === "associated");
  const hasOutcome = Boolean(outcome);
  const lineageStrength: LineageStrength = direct ? "direct" : associated ? "associated" : "unavailable";
  const limitation = direct || associated
    ? undefined
    : !hasOutcome
      ? "No canonical learning outcome is linked to this record."
      : competencyIds.length === 0
        ? "Completion/outcome exists, but no competency mapping is persisted."
        : "Competency mapping exists, but no persisted evidence or history link establishes the relationship.";
  return {
    id: item.id,
    source: normalizeAnalyticsSource(item.source),
    sourceId: item.sourceId,
    resourceType: item.resourceType,
    resourceId: item.resourceId,
    title: item.title,
    category: item.category,
    status: normalizeAnalyticsStatus(item.status),
    ...(progressReference ? { progressReference } : {}),
    ...(outcome ? {
      outcomeId: outcome.eventId,
      ...(outcome.sourceEventId ? { sourceEventId: outcome.sourceEventId } : {}),
      outcomeType: outcome.eventType,
      outcomeSource: outcome.source,
      outcomeTimestamp: asDate(outcome.occurredAt),
      validatedOutcome
    } : { validatedOutcome: false }),
    competencyIds,
    competencies,
    ...(item.evidenceReference ? { evidenceReference: item.evidenceReference } : {}),
    ...(item.personalization ? { personalization: {
      traceReference: item.personalization.traceReference,
      affectedCompetencyIds: [],
      affectedGapIds: [],
      affectedRecommendationIds: [],
      adaptive: {
        decision: item.personalization.adaptiveAction,
        performanceBand: item.personalization.performanceBand,
        confidence: item.personalization.confidence,
        fallbackUsed: item.personalization.fallbackUsed
      }
    } } : personalizationFrom(outcome) ? { personalization: personalizationFrom(outcome) } : {}),
    lineageStrength,
    lineageStatus: lineageStrength === "direct" ? "complete" : lineageStrength === "associated" ? "partial" : "unavailable",
    ...(limitation ? { limitation } : {}),
    ...(safeLineageMetadata(item.metadata) ? { metadata: safeLineageMetadata(item.metadata) } : {})
  };
}

/**
 * Builds lineage from already normalized history plus the persisted outcome and
 * competency evidence records. It never writes to any learning collection.
 */
export function buildEvidenceLineage(
  items: LearningHistoryItem[],
  outcomes: OutcomeRecord[],
  scores: ScoreRecord[]
) {
  const outcomeById = new Map(outcomes.map((outcome) => [outcome.eventId, outcome]));
  const outcomeByResource = new Map<string, OutcomeRecord>();
  outcomes.forEach((outcome) => outcomeByResource.set(outcomeKey(outcome), outcome));
  const scoresByCompetency = new Map(scores.map((score) => [idOf(score.competencyId), score]));
  const progressByResource = new Map<string, string>();
  items.forEach((item) => {
    if (item.id.startsWith("progress:")) progressByResource.set(historyOutcomeKey(item), item.sourceId);
  });
  return items.map((item) => {
    const directOutcome = item.source === "learning_outcome" ? outcomeById.get(item.sourceId) : undefined;
    const linkedOutcome = directOutcome || outcomeByResource.get(historyOutcomeKey(item));
    return buildLineageItem(item, linkedOutcome, scoresByCompetency, progressByResource.get(historyOutcomeKey(item)));
  });
}

/** Read-only learner-scoped evidence-lineage query for later effectiveness analytics. */
export async function getEvidenceLineage(userId: string, query: EvidenceLineageQuery = {}): Promise<EvidenceLineageResult> {
  const dateRange = createAnalyticsDateRange(query);
  const limit = Math.min(250, Math.max(1, Math.floor(query.limit || 100)));
  const history = await getUnifiedLearningHistory(userId, {
    from: dateRange.from,
    to: dateRange.to,
    source: query.source,
    resourceType: query.resourceType,
    page: 1,
    limit
  });
  const outcomes = await LearningOutcomeEventModel.find({
    userId,
    occurredAt: { $gte: dateRange.from, $lte: dateRange.to }
  }).select("eventId userId eventType resourceType resourceId source sourceEventId occurredAt status competencyIds outcomeScore metadata personalizationTrace").lean() as unknown as OutcomeRecord[];
  const competencyIds = [...new Set(outcomes.flatMap((outcome) => (outcome.competencyIds || []).map(idOf)).filter(Boolean))];
  const scores = competencyIds.length
    ? await CompetencyScoreModel.find({ userId, competencyId: { $in: competencyIds } }).select("_id competencyId frameworkId frameworkVersionId frameworkVersion proficiencyScale evidence history").lean() as unknown as ScoreRecord[]
    : [];
  const items = buildEvidenceLineage(history.items, outcomes, scores)
    .filter((item) => !query.resourceId || item.resourceId === query.resourceId);
  return { dateRange, items };
}
