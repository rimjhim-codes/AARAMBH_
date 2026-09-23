import {
  IGOTEnrollmentModel,
  LearningRecommendationModel,
  NSSTAEnrollmentModel
} from "../models/sih/SihModels";
import { LearningOutcomeEventModel } from "../models/LearningOutcomeEvent";
import { LearningProgressModel } from "../models/LearningProgress";
import {
  createAnalyticsDateRange,
  type AnalyticsDateRangeInput
} from "./analytics-foundation.service";
import {
  getEvidenceLineage,
  type EvidenceLineageItem,
  type LineageStrength
} from "./evidence-lineage.service";
import {
  getCompetencyBeforeAfter,
  type BeforeAfterCompetencyItem
} from "./competency-before-after.service";

export const TRAINING_EFFECTIVENESS_SOURCES = ["training", "igot", "nssta"] as const;
export type TrainingEffectivenessSource = (typeof TRAINING_EFFECTIVENESS_SOURCES)[number];
export type TrainingEffectivenessQuery = AnalyticsDateRangeInput;

export type TrainingEffectivenessInterpretation =
  | "NOT_COMPLETED"
  | "COMPLETED_NO_EVIDENCE"
  | "CONTEXT_ONLY"
  | "IMPROVEMENT_SUPPORTED"
  | "INSUFFICIENT_EVIDENCE";

type EnrollmentRecord = {
  courseId?: string;
  programmeId?: string;
  title?: string;
  status?: string;
  progressPercent?: number;
  source?: string;
  externalEnrollmentId?: string;
  lastSyncedAt?: Date;
  completedAt?: Date;
  updatedAt?: Date;
};

type ProgressRecord = {
  resourceType?: string;
  resourceId?: string;
  source?: string;
  progressPercent?: number;
  status?: string;
  startedAt?: Date;
  lastActivityAt?: Date;
  completedAt?: Date;
  completedOutcomeEventId?: string;
  metadata?: Record<string, unknown>;
};

type OutcomeRecord = {
  eventId: string;
  sourceEventId?: string;
  eventType: string;
  resourceType: string;
  resourceId: string;
  source: string;
  occurredAt: Date;
  status: string;
  competencyIds?: unknown[];
  outcomeScore?: number;
  metadata?: Record<string, unknown>;
  personalizationTrace?: Record<string, any>;
};

export type TrainingEffectivenessResult = {
  source: TrainingEffectivenessSource;
  resource: {
    resourceId: string;
    resourceType: string;
    title?: string;
    provider?: string;
    providerSource?: string;
    externalId?: string;
  };
  enrollment: {
    enrolled: boolean;
    status?: string;
    progressPercent?: number;
    source?: string;
    externalEnrollmentId?: string;
    startedAt?: Date;
    completedAt?: Date;
    lastSyncedAt?: Date;
  } | null;
  progress: {
    resourceType?: string;
    resourceId?: string;
    source?: string;
    progressPercent?: number;
    status?: string;
    startedAt?: Date;
    lastActivityAt?: Date;
    completedAt?: Date;
    completedOutcomeEventId?: string;
  } | null;
  completion: {
    completed: boolean;
    progressCompleted: boolean;
    enrollmentCompleted: boolean;
    validated: boolean;
    status: string;
    occurredAt?: Date;
    source?: string;
  };
  outcome: {
    eventId: string;
    sourceEventId?: string;
    eventType: string;
    resourceType: string;
    resourceId: string;
    source: string;
    occurredAt: Date;
    status: string;
    validatedOutcome: boolean;
    competencyIds: string[];
    outcomeScore?: number;
    personalization?: {
      traceReference: string;
      scope?: string;
      scopeFallback?: boolean;
      affectedCompetencyIds: string[];
      affectedGapIds: string[];
      affectedRecommendationIds: string[];
    };
  } | null;
  lineage: {
    strength: LineageStrength;
    status: "complete" | "partial" | "unavailable";
    items: EvidenceLineageItem[];
  };
  catalogCompetencyContext: [];
  competencyObservation: {
    classification: "improved" | "unchanged" | "declined" | "insufficient_evidence";
    confidence: "high" | "medium" | "low" | "insufficient";
    items: BeforeAfterCompetencyItem[];
    limitations: string[];
  };
  recommendationContext: {
    recommendationId: string;
    source: string;
    externalId?: string;
    matchedCompetencies: string[];
    solvedGaps: string[];
    reasonCodes: string[];
    confidence?: string;
    personalizationFactors: string[];
  } | null;
  interpretation: TrainingEffectivenessInterpretation;
  interpretationSummary: string;
  limitations: string[];
};

export class TrainingEffectivenessResourceNotFoundError extends Error {
  statusCode = 404;

  constructor() {
    super("Training resource not found.");
    this.name = "TrainingEffectivenessResourceNotFoundError";
  }
}

function idOf(value: unknown) {
  return String(value || "");
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function resourceTypeFor(source: TrainingEffectivenessSource) {
  return source === "igot" ? "igot_course" : source === "nssta" ? "nssta_course" : "training";
}

function outcomeTypeFor(source: TrainingEffectivenessSource) {
  return source === "igot" ? "course.completed" : "training.completed";
}

function outcomeResourceTypeFor(source: TrainingEffectivenessSource) {
  return source === "igot" ? "course" : "training";
}

function providerFor(source: TrainingEffectivenessSource) {
  return source === "igot" ? "iGOT Karmayogi" : source === "nssta" ? "NSSTA TPAC" : "ARAMBH internal training";
}

function strongestLineage(items: EvidenceLineageItem[]): LineageStrength {
  if (items.some((item) => item.lineageStrength === "direct")) return "direct";
  if (items.some((item) => item.lineageStrength === "associated")) return "associated";
  return "unavailable";
}

function safePersonalization(trace: Record<string, any> | undefined) {
  if (!trace?.traceReference) return undefined;
  return {
    traceReference: String(trace.traceReference),
    ...(trace.scope ? { scope: String(trace.scope) } : {}),
    ...(trace.scopeFallback !== undefined ? { scopeFallback: Boolean(trace.scopeFallback) } : {}),
    affectedCompetencyIds: (trace.affectedCompetencyIds || []).map(idOf),
    affectedGapIds: (trace.gapIds || []).map(idOf),
    affectedRecommendationIds: (trace.recommendationIds || []).map(idOf)
  };
}

function safeProgress(progress: ProgressRecord | null) {
  if (!progress) return null;
  return {
    ...(progress.resourceType ? { resourceType: progress.resourceType } : {}),
    ...(progress.resourceId ? { resourceId: progress.resourceId } : {}),
    ...(progress.source ? { source: progress.source } : {}),
    ...(progress.progressPercent !== undefined ? { progressPercent: progress.progressPercent } : {}),
    ...(progress.status ? { status: progress.status } : {}),
    ...(progress.startedAt ? { startedAt: progress.startedAt } : {}),
    ...(progress.lastActivityAt ? { lastActivityAt: progress.lastActivityAt } : {}),
    ...(progress.completedAt ? { completedAt: progress.completedAt } : {}),
    ...(progress.completedOutcomeEventId ? { completedOutcomeEventId: progress.completedOutcomeEventId } : {})
  };
}

function safeEnrollment(enrollment: EnrollmentRecord | null) {
  if (!enrollment) return null;
  return {
    enrolled: true,
    ...(enrollment.status ? { status: enrollment.status } : {}),
    ...(enrollment.progressPercent !== undefined ? { progressPercent: enrollment.progressPercent } : {}),
    ...(enrollment.source ? { source: enrollment.source } : {}),
    ...(enrollment.externalEnrollmentId ? { externalEnrollmentId: enrollment.externalEnrollmentId } : {}),
    ...(enrollment.completedAt ? { completedAt: enrollment.completedAt } : {}),
    ...(enrollment.lastSyncedAt ? { lastSyncedAt: enrollment.lastSyncedAt } : {})
  };
}

function safeOutcome(outcome: OutcomeRecord | null) {
  if (!outcome) return null;
  return {
    eventId: outcome.eventId,
    ...(outcome.sourceEventId ? { sourceEventId: outcome.sourceEventId } : {}),
    eventType: outcome.eventType,
    resourceType: outcome.resourceType,
    resourceId: outcome.resourceId,
    source: outcome.source,
    occurredAt: outcome.occurredAt,
    status: outcome.status,
    validatedOutcome: outcome.status === "processed",
    competencyIds: (outcome.competencyIds || []).map(idOf),
    ...(outcome.outcomeScore !== undefined ? { outcomeScore: outcome.outcomeScore } : {}),
    ...(safePersonalization(outcome.personalizationTrace) ? { personalization: safePersonalization(outcome.personalizationTrace) } : {})
  };
}

function aggregateObservation(items: BeforeAfterCompetencyItem[], limitations: string[]) {
  if (!items.length) return {
    classification: "insufficient_evidence" as const,
    confidence: "insufficient" as const,
    items,
    limitations
  };
  const classification = items.some((item) => item.observedChange.classification === "improved")
    ? "improved" as const
    : items.some((item) => item.observedChange.classification === "declined")
      ? "declined" as const
      : items.every((item) => item.observedChange.classification === "unchanged")
        ? "unchanged" as const
        : "insufficient_evidence" as const;
  const rank = { insufficient: 0, low: 1, medium: 2, high: 3 };
  const confidence = items.reduce<BeforeAfterCompetencyItem["confidence"]>(
    (best, item) => rank[item.confidence] > rank[best] ? item.confidence : best,
    "insufficient"
  );
  return { classification, confidence, items, limitations };
}

async function loadEnrollment(userId: string, source: TrainingEffectivenessSource, resourceId: string) {
  if (source === "igot") {
    return await IGOTEnrollmentModel.findOne({ userId, courseId: resourceId })
      .select("courseId title status progressPercent source externalEnrollmentId lastSyncedAt completedAt updatedAt")
      .lean() as unknown as EnrollmentRecord | null;
  }
  if (source === "nssta") {
    return await NSSTAEnrollmentModel.findOne({ userId, programmeId: resourceId })
      .select("programmeId title status progressPercent source externalEnrollmentId lastSyncedAt completedAt updatedAt")
      .lean() as unknown as EnrollmentRecord | null;
  }
  return null;
}

/** Read-only, learner-scoped effectiveness projection for internal/external training. */
export async function getTrainingEffectiveness(
  userId: string,
  source: TrainingEffectivenessSource,
  resourceId: string,
  query: TrainingEffectivenessQuery = {}
): Promise<TrainingEffectivenessResult> {
  const dateRange = createAnalyticsDateRange(query);
  const normalizedResourceId = String(resourceId || "").trim();
  if (!normalizedResourceId || normalizedResourceId.length > 200) throw new TrainingEffectivenessResourceNotFoundError();

  const [enrollment, progress] = await Promise.all([
    loadEnrollment(userId, source, normalizedResourceId),
    LearningProgressModel.findOne({ userId, resourceType: resourceTypeFor(source), resourceId: normalizedResourceId })
      .select("resourceType resourceId source progressPercent status startedAt lastActivityAt completedAt completedOutcomeEventId metadata")
      .lean() as unknown as Promise<ProgressRecord | null>
  ]);

  const outcomeQuery: Record<string, unknown> = {
    userId,
    eventType: outcomeTypeFor(source),
    resourceType: outcomeResourceTypeFor(source),
    resourceId: normalizedResourceId,
    source,
    occurredAt: { $gte: dateRange.from, $lte: dateRange.to }
  };
  if (progress?.completedOutcomeEventId) outcomeQuery.eventId = progress.completedOutcomeEventId;
  const outcome = await LearningOutcomeEventModel.findOne(outcomeQuery)
    .sort({ occurredAt: -1 })
    .lean() as unknown as OutcomeRecord | null;

  const lineageResult = await getEvidenceLineage(userId, {
    from: dateRange.from,
    to: dateRange.to,
    source: source === "training" ? "training" : source,
    resourceId: normalizedResourceId,
    limit: 250
  });
  const lineageItems = outcome?.eventId
    ? lineageResult.items.filter((item) => !item.outcomeId || item.outcomeId === outcome.eventId)
    : lineageResult.items;
  const lineageStrength = strongestLineage(lineageItems);
  const outcomeCompetencyIds = unique((outcome?.competencyIds || []).map(idOf));
  const progressCompleted = progress?.status === "completed";
  const enrollmentCompleted = enrollment?.status === "completed";
  const validatedOutcome = Boolean(outcome
    && outcome.status === "processed"
    && outcome.eventType === outcomeTypeFor(source)
    && outcome.source === source);
  const completionValid = source !== "training"
    && Boolean(enrollment && progress && progressCompleted && enrollmentCompleted && validatedOutcome);
  const observationLimitations: string[] = [];
  let competencyObservation: TrainingEffectivenessResult["competencyObservation"];
  if (!outcomeCompetencyIds.length) {
    observationLimitations.push("completion_without_persisted_competency_evidence");
    competencyObservation = { classification: "insufficient_evidence", confidence: "insufficient", items: [], limitations: observationLimitations };
  } else {
    const beforeAfter = await getCompetencyBeforeAfter(userId, { from: dateRange.from, to: dateRange.to, limit: 250 });
    const items = beforeAfter.items.filter((item) => item.learningAnchor.outcomeId === outcome?.eventId);
    competencyObservation = aggregateObservation(items, [...beforeAfter.limitations]);
  }
  if (competencyObservation.classification === "improved" && lineageStrength === "unavailable") {
    competencyObservation = {
      ...competencyObservation,
      classification: "insufficient_evidence",
      confidence: "insufficient",
      limitations: [...competencyObservation.limitations, "Observed change lacks persisted source competency lineage."]
    };
  }

  const recommendation = await LearningRecommendationModel.findOne({ userId, source, externalId: normalizedResourceId })
    .select("_id source externalId matchedCompetencies solvedGaps reasonCodes confidence personalizationFactors")
    .lean() as any;
  const recommendationContext = recommendation ? {
    recommendationId: String(recommendation._id),
    source: String(recommendation.source),
    ...(recommendation.externalId ? { externalId: String(recommendation.externalId) } : {}),
    matchedCompetencies: (recommendation.matchedCompetencies || []).map(String),
    solvedGaps: (recommendation.solvedGaps || []).map(String),
    reasonCodes: (recommendation.reasonCodes || []).map(String),
    ...(recommendation.confidence ? { confidence: String(recommendation.confidence) } : {}),
    personalizationFactors: (recommendation.personalizationFactors || []).map(String)
  } : null;

  const limitations = [...competencyObservation.limitations];
  if (source === "training") limitations.push("No dedicated authoritative internal-training enrollment or completion source exists.");
  if (!enrollment && source !== "training") limitations.push("No provider enrollment exists for this learner and resource.");
  if (!progress) limitations.push("No LearningProgress record exists for this learner and resource.");
  if (progressCompleted && !outcome) limitations.push("No matching processed completion outcome exists in the selected range.");
  if (lineageStrength === "unavailable") limitations.push("No persisted competency evidence or history relationship establishes source competency impact.");
  limitations.push("Enrollment, progress, completion, and provider/catalog mappings are context; they are not competency evidence by themselves.");
  limitations.push("This read-only result reports observed associations and does not establish causal effectiveness.");
  limitations.push("The current provider resource identity does not provide a separate repeat-completion cycle identifier.");

  let interpretation: TrainingEffectivenessInterpretation;
  let interpretationSummary: string;
  if (source === "training") {
    interpretation = "INSUFFICIENT_EVIDENCE";
    interpretationSummary = "Internal training lacks an authoritative enrollment/completion source for effectiveness analysis.";
  } else if (!enrollmentCompleted || !progressCompleted) {
    interpretation = "NOT_COMPLETED";
    interpretationSummary = "Provider completion has not been validated.";
  } else if (!completionValid) {
    interpretation = "INSUFFICIENT_EVIDENCE";
    interpretationSummary = "Provider progress is complete, but a matching processed completion outcome is not available.";
  } else if (competencyObservation.classification === "improved"
    && (lineageStrength === "direct" || lineageStrength === "associated")) {
    interpretation = "IMPROVEMENT_SUPPORTED";
    interpretationSummary = "Persisted competency observations support a measurable change; this is not a causal effectiveness claim.";
  } else if (!outcomeCompetencyIds.length) {
    interpretation = "COMPLETED_NO_EVIDENCE";
    interpretationSummary = "Completion is validated, but no persisted competency evidence is available.";
  } else if (lineageStrength !== "unavailable") {
    interpretation = "CONTEXT_ONLY";
    interpretationSummary = "Provider competency context exists, but source-specific competency improvement is not established.";
  } else {
    interpretation = "INSUFFICIENT_EVIDENCE";
    interpretationSummary = "Available observations are insufficient to establish source-specific competency improvement.";
  }

  return {
    source,
    resource: {
      resourceId: normalizedResourceId,
      resourceType: resourceTypeFor(source),
      ...(enrollment?.title ? { title: String(enrollment.title) } : {}),
      provider: providerFor(source),
      ...(enrollment?.source ? { providerSource: String(enrollment.source) } : {}),
      ...(enrollment?.externalEnrollmentId ? { externalId: String(enrollment.externalEnrollmentId) } : {})
    },
    enrollment: safeEnrollment(enrollment),
    progress: safeProgress(progress),
    completion: {
      completed: completionValid,
      progressCompleted,
      enrollmentCompleted,
      validated: completionValid,
      status: progress?.status || enrollment?.status || "not_started",
      ...(outcome?.occurredAt || progress?.completedAt || enrollment?.completedAt ? { occurredAt: outcome?.occurredAt || progress?.completedAt || enrollment?.completedAt } : {}),
      ...(outcome?.source || progress?.source || enrollment?.source ? { source: outcome?.source || progress?.source || enrollment?.source } : {})
    },
    outcome: safeOutcome(outcome),
    lineage: {
      strength: lineageStrength,
      status: lineageStrength === "direct" ? "complete" : lineageStrength === "associated" ? "partial" : "unavailable",
      items: lineageItems
    },
    catalogCompetencyContext: [],
    competencyObservation,
    recommendationContext,
    interpretation,
    interpretationSummary,
    limitations: [...new Set(limitations)]
  };
}
