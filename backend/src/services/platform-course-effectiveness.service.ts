import { CompetencyModel, LearningRecommendationModel, PlatformCourseModel } from "../models/sih/SihModels";
import { LearningOutcomeEventModel } from "../models/LearningOutcomeEvent";
import { LearningProgressModel } from "../models/LearningProgress";
import {
  getCompetencyBeforeAfter,
  type BeforeAfterCompetencyItem
} from "./competency-before-after.service";
import {
  getEvidenceLineage,
  type EvidenceLineageItem,
  type LineageStrength
} from "./evidence-lineage.service";
import {
  createAnalyticsDateRange,
  type AnalyticsDateRangeInput
} from "./analytics-foundation.service";

export type PlatformCourseEffectivenessInterpretation =
  | "NOT_COMPLETED"
  | "COMPLETED_NO_EVIDENCE"
  | "COMPLETED_WITH_ASSOCIATED_CONTEXT"
  | "IMPROVEMENT_SUPPORTED"
  | "INSUFFICIENT_EVIDENCE";

export type PlatformCourseEffectivenessQuery = AnalyticsDateRangeInput;

type PlatformCourseRecord = {
  code: string;
  title: string;
  description?: string;
  provider?: string;
  difficulty?: string;
  durationHours?: number;
  competencyCodes?: string[];
  lectureIds?: unknown[];
  catalogType?: string;
  isActive?: boolean;
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
  personalizationTrace?: Record<string, any>;
};

type CompetencyContext = {
  competencyCode: string;
  resolvedCompetencyId?: string;
  competencyName?: string;
  mappingStatus: "resolved" | "unresolved";
  isEvidence: false;
};

export type PlatformCourseEffectivenessResult = {
  course: {
    code: string;
    title: string;
    description?: string;
    provider?: string;
    difficulty?: string;
    durationHours?: number;
    competencyCodes: string[];
    lectureIds: string[];
    catalogType?: string;
    isActive?: boolean;
  };
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
    metadata?: Record<string, unknown>;
  } | null;
  completion: {
    completed: boolean;
    progressCompleted: boolean;
    completionStatus: string;
    completionTimestamp?: Date;
    validated: boolean;
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
  catalogCompetencyContext: CompetencyContext[];
  competencyObservation: {
    classification: "improved" | "unchanged" | "declined" | "insufficient_evidence";
    confidence: "high" | "medium" | "low" | "insufficient";
    items: BeforeAfterCompetencyItem[];
    limitations: string[];
  };
  recommendationContext: {
    recommendationId: string;
    status?: string;
    matchedCompetencies: string[];
    solvedGaps: string[];
    reasonCodes: string[];
    reasonSummary?: string;
    confidence?: string;
    personalizationFactors: string[];
  } | null;
  interpretation: PlatformCourseEffectivenessInterpretation;
  interpretationSummary: string;
  limitations: string[];
};

export class PlatformCourseNotFoundError extends Error {
  statusCode = 404;

  constructor() {
    super("Platform course not found.");
    this.name = "PlatformCourseNotFoundError";
  }
}

function idOf(value: unknown) {
  return String(value || "");
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function safeMetadata(metadata: Record<string, unknown> | undefined) {
  if (!metadata) return undefined;
  const allowed = ["title", "lectureCount", "minutes", "providerSource"];
  const result = Object.fromEntries(
    allowed
      .filter((key) => metadata[key] !== undefined)
      .map((key) => [key, metadata[key]])
  );
  return Object.keys(result).length ? result : undefined;
}

function safeProgress(progress: ProgressRecord | undefined) {
  if (!progress) return undefined;
  return {
    ...(progress.resourceType ? { resourceType: progress.resourceType } : {}),
    ...(progress.resourceId ? { resourceId: progress.resourceId } : {}),
    ...(progress.source ? { source: progress.source } : {}),
    ...(progress.progressPercent !== undefined ? { progressPercent: progress.progressPercent } : {}),
    ...(progress.status ? { status: progress.status } : {}),
    ...(progress.startedAt ? { startedAt: progress.startedAt } : {}),
    ...(progress.lastActivityAt ? { lastActivityAt: progress.lastActivityAt } : {}),
    ...(progress.completedAt ? { completedAt: progress.completedAt } : {}),
    ...(progress.completedOutcomeEventId ? { completedOutcomeEventId: progress.completedOutcomeEventId } : {}),
    ...(safeMetadata(progress.metadata) ? { metadata: safeMetadata(progress.metadata) } : {})
  };
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

function safeOutcome(outcome: OutcomeRecord | undefined) {
  if (!outcome) return undefined;
  return {
    eventId: outcome.eventId,
    ...(outcome.sourceEventId ? { sourceEventId: outcome.sourceEventId } : {}),
    eventType: outcome.eventType,
    resourceType: outcome.resourceType,
    resourceId: outcome.resourceId,
    source: outcome.source,
    occurredAt: outcome.occurredAt,
    status: outcome.status,
    validatedOutcome: outcome.status === "processed" && outcome.eventType === "course.completed",
    competencyIds: (outcome.competencyIds || []).map(idOf),
    ...(outcome.outcomeScore !== undefined ? { outcomeScore: outcome.outcomeScore } : {}),
    ...(safePersonalization(outcome.personalizationTrace) ? { personalization: safePersonalization(outcome.personalizationTrace) } : {})
  };
}

function strongestLineage(items: EvidenceLineageItem[]): LineageStrength {
  if (items.some((item) => item.lineageStrength === "direct")) return "direct";
  if (items.some((item) => item.lineageStrength === "associated")) return "associated";
  return "unavailable";
}

function confidenceRank(confidence: BeforeAfterCompetencyItem["confidence"]) {
  return { insufficient: 0, low: 1, medium: 2, high: 3 }[confidence];
}

function aggregateObservation(items: BeforeAfterCompetencyItem[], limitations: string[]) {
  if (!items.length) {
    return {
      classification: "insufficient_evidence" as const,
      confidence: "insufficient" as const,
      items,
      limitations
    };
  }
  const classification = items.some((item) => item.observedChange.classification === "improved")
    ? "improved" as const
    : items.some((item) => item.observedChange.classification === "declined")
      ? "declined" as const
      : items.every((item) => item.observedChange.classification === "unchanged")
        ? "unchanged" as const
        : "insufficient_evidence" as const;
  const confidence = items.reduce<BeforeAfterCompetencyItem["confidence"]>(
    (best, item) => confidenceRank(item.confidence) > confidenceRank(best) ? item.confidence : best,
    "insufficient"
  );
  return { classification, confidence, items, limitations };
}

function interpretationFor(input: {
  validatedCompletion: boolean;
  progressCompleted: boolean;
  competencyIds: string[];
  catalogCompetencyContext: CompetencyContext[];
  lineageStrength: LineageStrength;
  observation: PlatformCourseEffectivenessResult["competencyObservation"];
}): [PlatformCourseEffectivenessInterpretation, string] {
  if (!input.progressCompleted || !input.validatedCompletion) {
    return [
      input.progressCompleted ? "INSUFFICIENT_EVIDENCE" : "NOT_COMPLETED",
      input.progressCompleted
        ? "Course progress is complete, but a processed course completion outcome is not available in the selected range."
        : "Course completion has not been validated."
    ];
  }
  if (input.observation.classification === "improved"
    && (input.lineageStrength === "direct" || input.lineageStrength === "associated")) {
    return ["IMPROVEMENT_SUPPORTED", "Persisted competency observations support a measurable change; this is not a causal effectiveness claim."];
  }
  if (!input.competencyIds.length) {
    return ["COMPLETED_NO_EVIDENCE", "Course completion is validated, but no persisted competency evidence is available." + (input.catalogCompetencyContext.length ? " Catalog mappings are contextual only." : "")];
  }
  if (input.lineageStrength === "direct" || input.lineageStrength === "associated") {
    return ["COMPLETED_WITH_ASSOCIATED_CONTEXT", "Course completion has persisted competency context, but measurable course-specific improvement is not established."];
  }
  return ["INSUFFICIENT_EVIDENCE", "Available observations are insufficient to establish course-specific competency improvement."];
}

function courseProjection(course: PlatformCourseRecord) {
  return {
    code: course.code,
    title: course.title,
    ...(course.description ? { description: course.description } : {}),
    ...(course.provider ? { provider: course.provider } : {}),
    ...(course.difficulty ? { difficulty: course.difficulty } : {}),
    ...(course.durationHours !== undefined ? { durationHours: course.durationHours } : {}),
    competencyCodes: unique((course.competencyCodes || []).map(String)),
    lectureIds: (course.lectureIds || []).map(idOf),
    ...(course.catalogType ? { catalogType: course.catalogType } : {}),
    ...(course.isActive !== undefined ? { isActive: course.isActive } : {})
  };
}

/** Read-only, learner-scoped platform-course effectiveness projection. */
export async function getPlatformCourseEffectiveness(
  userId: string,
  courseCode: string,
  query: PlatformCourseEffectivenessQuery = {}
): Promise<PlatformCourseEffectivenessResult> {
  const dateRange = createAnalyticsDateRange(query);
  const normalizedCode = String(courseCode || "").trim();
  if (!normalizedCode || normalizedCode.length > 120) throw new PlatformCourseNotFoundError();

  const course = await PlatformCourseModel.findOne({ code: normalizedCode, catalogType: "platform", isActive: true })
    .select("code title description provider difficulty durationHours competencyCodes lectureIds catalogType isActive")
    .lean() as unknown as PlatformCourseRecord | null;
  if (!course) throw new PlatformCourseNotFoundError();

  const progress = await LearningProgressModel.findOne({ userId, resourceType: "platform_course", resourceId: course.code })
    .select("resourceType resourceId source progressPercent status startedAt lastActivityAt completedAt completedOutcomeEventId metadata")
    .lean() as unknown as ProgressRecord | null;
  const outcomeQuery: Record<string, unknown> = {
    userId,
    eventType: "course.completed",
    resourceType: "course",
    resourceId: course.code,
    source: "platform",
    occurredAt: { $gte: dateRange.from, $lte: dateRange.to }
  };
  if (progress?.completedOutcomeEventId) outcomeQuery.eventId = progress.completedOutcomeEventId;
  const [outcome, recommendation] = await Promise.all([
    LearningOutcomeEventModel.findOne(outcomeQuery).sort({ occurredAt: -1 }).lean() as unknown as Promise<OutcomeRecord | null>,
    LearningRecommendationModel.findOne({ userId, source: "platform", externalId: course.code })
      .select("_id status matchedCompetencies solvedGaps reasonCodes reasonSummary confidence personalizationFactors")
      .lean() as unknown as Promise<any | null>
  ]);

  const codes = unique((course.competencyCodes || []).map(String));
  const mappedCompetencies = codes.length
    ? await CompetencyModel.find({ code: { $in: codes }, isActive: true }).select("_id code name").lean()
    : [];
  const mappedByCode = new Map(mappedCompetencies.map((item: any) => [String(item.code), item]));
  const catalogCompetencyContext = codes.map((code) => {
    const mapped = mappedByCode.get(code);
    return {
      competencyCode: code,
      ...(mapped?._id ? { resolvedCompetencyId: String(mapped._id) } : {}),
      ...(mapped?.name ? { competencyName: String(mapped.name) } : {}),
      mappingStatus: mapped ? "resolved" as const : "unresolved" as const,
      isEvidence: false as const
    };
  });

  const lineageResult = await getEvidenceLineage(userId, {
    from: dateRange.from,
    to: dateRange.to,
    source: "platform",
    resourceType: "platform_course",
    resourceId: course.code,
    limit: 250
  });
  const lineageItems = outcome?.eventId
    ? lineageResult.items.filter((item) => !item.outcomeId || item.outcomeId === outcome.eventId)
    : lineageResult.items;
  const lineageStrength = strongestLineage(lineageItems);
  const lineageStatus = lineageStrength === "direct" ? "complete" as const : lineageStrength === "associated" ? "partial" as const : "unavailable" as const;
  const safeOutcomeRecord = safeOutcome(outcome || undefined);
  const competencyIds = (outcome?.competencyIds || []).map(idOf).filter(Boolean);
  const progressCompleted = progress?.status === "completed";
  const validatedCompletion = progressCompleted && Boolean(outcome && outcome.status === "processed" && outcome.eventType === "course.completed");
  const observationLimitations: string[] = [];
  let competencyObservation: PlatformCourseEffectivenessResult["competencyObservation"];
  if (!competencyIds.length) {
    observationLimitations.push("course_completion_without_persisted_competency_evidence");
    competencyObservation = {
      classification: "insufficient_evidence",
      confidence: "insufficient",
      items: [],
      limitations: observationLimitations
    };
  } else {
    const beforeAfter = await getCompetencyBeforeAfter(userId, {
      from: dateRange.from,
      to: dateRange.to,
      limit: 250
    });
    const items = beforeAfter.items.filter((item) => item.learningAnchor.outcomeId === outcome?.eventId);
    competencyObservation = aggregateObservation(items, [...beforeAfter.limitations]);
  }
  if (competencyObservation.classification === "improved" && lineageStrength === "unavailable") {
    competencyObservation = {
      ...competencyObservation,
      classification: "insufficient_evidence",
      confidence: "insufficient",
      limitations: [
        ...competencyObservation.limitations,
        "Observed change is not reported as course-supported improvement because no persisted competency lineage is available."
      ]
    };
  }

  const recommendationContext = recommendation ? {
    recommendationId: String(recommendation._id),
    ...(recommendation.status ? { status: String(recommendation.status) } : {}),
    matchedCompetencies: (recommendation.matchedCompetencies || []).map(String),
    solvedGaps: (recommendation.solvedGaps || []).map(String),
    reasonCodes: (recommendation.reasonCodes || []).map(String),
    ...(recommendation.reasonSummary ? { reasonSummary: String(recommendation.reasonSummary) } : {}),
    ...(recommendation.confidence ? { confidence: String(recommendation.confidence) } : {}),
    personalizationFactors: (recommendation.personalizationFactors || []).map(String)
  } : undefined;

  const limitations = [...competencyObservation.limitations];
  if (!progress) limitations.push("No platform-course progress record exists for this learner.");
  if (progressCompleted && !outcome) limitations.push("No processed course.completed outcome exists in the selected analytics range.");
  if (catalogCompetencyContext.some((item) => item.mappingStatus === "unresolved")) limitations.push("One or more catalog competency codes could not be resolved; catalog context is incomplete.");
  if (lineageStrength === "unavailable") limitations.push("No persisted competency evidence or history relationship establishes course competency impact.");
  limitations.push("Course completion and catalog competency mappings are contextual; they are not competency evidence by themselves.");
  limitations.push("This read-only result reports observed associations and does not establish causal course effectiveness.");
  limitations.push("The current learner/course identity does not provide a separate repeat-completion cycle identifier.");

  const [interpretation, interpretationSummary] = interpretationFor({
    validatedCompletion,
    progressCompleted,
    competencyIds,
    catalogCompetencyContext,
    lineageStrength,
    observation: competencyObservation
  });

  return {
    course: courseProjection(course),
    progress: safeProgress(progress || undefined) || null,
    completion: {
      completed: validatedCompletion,
      progressCompleted,
      completionStatus: progress?.status || "not_started",
      ...(outcome?.occurredAt || progress?.completedAt ? { completionTimestamp: outcome?.occurredAt || progress?.completedAt } : {}),
      validated: validatedCompletion,
      ...(outcome?.source || progress?.source ? { source: outcome?.source || progress?.source } : {})
    },
    outcome: safeOutcomeRecord || null,
    lineage: { strength: lineageStrength, status: lineageStatus, items: lineageItems },
    catalogCompetencyContext,
    competencyObservation,
    recommendationContext: recommendationContext || null,
    interpretation,
    interpretationSummary,
    limitations: [...new Set(limitations)]
  };
}
