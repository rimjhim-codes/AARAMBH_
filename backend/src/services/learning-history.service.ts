import { LearningOutcomeEventModel } from "../models/LearningOutcomeEvent";
import { LearningProgressModel } from "../models/LearningProgress";
import { VirtualLabAttemptModel } from "../models/VirtualLabAttempt";
import {
  CompetencyAssessmentModel,
  CompetencyModel,
  CompetencyScoreModel,
  FormalQuizAttemptModel,
  FormalQuizModel,
  IGOTEnrollmentModel,
  LearningActivityModel,
  NSSTAEnrollmentModel,
  PlatformCourseModel
} from "../models/sih/SihModels";
import { LectureModel } from "../models/Lecture";

export const HISTORY_SOURCES = [
  "platform",
  "lecture",
  "quiz",
  "assessment",
  "virtual_lab",
  "training",
  "igot",
  "nssta",
  "learning_activity",
  "learning_outcome"
] as const;
export type LearningHistorySource = (typeof HISTORY_SOURCES)[number];

export type LearningHistoryItem = {
  id: string;
  source: LearningHistorySource;
  sourceId: string;
  resourceId?: string;
  resourceType?: string;
  eventType?: string;
  title: string;
  category?: string;
  status: string;
  sourceStatus?: string;
  progress?: number;
  startedAt?: Date;
  completedAt?: Date;
  occurredAt: Date;
  durationMinutes?: number;
  score?: number;
  outcome?: string;
  competencyImpact?: {
    competencyId: string;
    name?: string;
    code?: string;
    frameworkId?: string;
    frameworkVersionId?: string;
    frameworkVersion?: string;
    evidenceReference?: string;
  }[];
  evidenceReference?: string;
  personalization?: {
    traceReference: string;
    adaptiveAction?: string;
    performanceBand?: string;
    confidence?: string;
    fallbackUsed?: boolean;
  };
  metadata?: Record<string, unknown>;
};

export type LearningHistoryQuery = {
  source?: LearningHistorySource;
  resourceType?: string;
  status?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
};

function asDate(value: unknown, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function idOf(value: unknown) {
  return String(value || "");
}

function normalizedStatus(status: string, passed?: boolean) {
  if (status === "passed" || passed === true) return "passed";
  if (status === "failed") return "failed";
  if (status === "abandoned") return "abandoned";
  if (["completed", "complete"].includes(status)) return "completed";
  if (["in_progress", "started", "enrolled", "processing", "recorded"].includes(status)) return "in_progress";
  return status || "recorded";
}

function safeMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const source = metadata as Record<string, unknown>;
  const allowed = ["title", "labTitle", "labCategory", "competencyCode", "category", "topic", "providerSource", "minutes", "lectureCount", "attemptNumber", "feedback"];
  const result = Object.fromEntries(allowed.filter((key) => source[key] !== undefined).map((key) => [key, source[key]]));
  return Object.keys(result).length ? result : undefined;
}

function itemKey(item: Pick<LearningHistoryItem, "source" | "sourceId" | "eventType">) {
  return `${item.source}:${item.sourceId}:${item.eventType || "activity"}`;
}

/** Public for deterministic unit tests and for keeping correlation rules explicit. */
export function deduplicateHistoryItems(items: LearningHistoryItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = itemKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * History is a read projection over existing collections. The source systems
 * remain authoritative; this function only normalizes their display shape.
 */
export function normalizeHistoryStatus(status: string, passed?: boolean) {
  return normalizedStatus(status, passed);
}

export async function getUnifiedLearningHistory(userId: string, query: LearningHistoryQuery = {}) {
  const page = Math.max(1, Math.floor(query.page || 1));
  const limit = Math.min(50, Math.max(1, Math.floor(query.limit || 20)));
  const sourceLimit = 250;
  const dateFilter = {
    ...(query.from || query.to
      ? { $gte: query.from, $lte: query.to }
      : {})
  };
  const occurredFilter = Object.keys(dateFilter).length ? { occurredAt: dateFilter } : {};
  const updatedFilter = Object.keys(dateFilter).length ? { updatedAt: dateFilter } : {};

  const [activities, outcomes, progress, attempts, assessments, quizAttempts, igot, nssta] = await Promise.all([
    LearningActivityModel.find({ userId, ...occurredFilter }).sort({ occurredAt: -1 }).limit(sourceLimit).lean(),
    LearningOutcomeEventModel.find({ userId, ...occurredFilter }).sort({ occurredAt: -1 }).limit(sourceLimit).lean(),
    LearningProgressModel.find({ userId, ...updatedFilter }).sort({ lastActivityAt: -1 }).limit(sourceLimit).lean(),
    VirtualLabAttemptModel.find({ userId, ...(Object.keys(dateFilter).length ? { startedAt: dateFilter } : {}) }).sort({ startedAt: -1 }).limit(sourceLimit).lean(),
    CompetencyAssessmentModel.find({ userId, ...(Object.keys(dateFilter).length ? { completedAt: dateFilter } : {}) }).sort({ completedAt: -1 }).limit(sourceLimit).lean(),
    FormalQuizAttemptModel.find({ userId, ...(Object.keys(dateFilter).length ? { createdAt: dateFilter } : {}) }).sort({ createdAt: -1 }).limit(sourceLimit).lean(),
    IGOTEnrollmentModel.find({ userId, ...updatedFilter }).sort({ updatedAt: -1 }).limit(sourceLimit).lean(),
    NSSTAEnrollmentModel.find({ userId, ...updatedFilter }).sort({ updatedAt: -1 }).limit(sourceLimit).lean()
  ]);

  const platformProgress = progress.filter((row) => row.resourceType === "platform_course");
  const lectureProgress = progress.filter((row) => row.resourceType === "lecture" || row.resourceType === "learning_material");
  const platformCodes = platformProgress.map((row) => row.resourceId);
  const lectureIds = lectureProgress.map((row) => row.resourceId);
  const quizIds = quizAttempts.map((row) => String(row.quizId));
  const competencyIds = outcomes.flatMap((row) => (row.competencyIds || []).map(String));
  const [courses, lectures, quizzes, competencies, scores] = await Promise.all([
    platformCodes.length ? PlatformCourseModel.find({ code: { $in: platformCodes } }).select("code title keywords").lean() : [],
    lectureIds.length ? LectureModel.find({ _id: { $in: lectureIds } }).select("_id title topicTags").lean() : [],
    quizIds.length ? FormalQuizModel.find({ _id: { $in: quizIds } }).select("_id title topic difficulty").lean() : [],
    competencyIds.length ? CompetencyModel.find({ _id: { $in: [...new Set(competencyIds)] } }).select("_id name code category frameworkId frameworkVersionId frameworkVersion").lean() : [],
    competencyIds.length ? CompetencyScoreModel.find({ userId, competencyId: { $in: [...new Set(competencyIds)] } }).select("competencyId frameworkId frameworkVersionId frameworkVersion evidence").lean() : []
  ]);
  const courseByCode = new Map(courses.map((course: any) => [String(course.code), course]));
  const lectureById = new Map(lectures.map((lecture: any) => [String(lecture._id), lecture]));
  const quizById = new Map(quizzes.map((quiz: any) => [String(quiz._id), quiz]));
  const competencyById = new Map(competencies.map((competency: any) => [String(competency._id), competency]));
  const scoreByCompetency = new Map(scores.map((score: any) => [String(score.competencyId), score]));
  const outcomeByResource = new Map(outcomes.map((outcome: any) => [`${outcome.resourceType}:${outcome.resourceId}`, outcome]));
  const items: LearningHistoryItem[] = [];

  for (const outcome of outcomes) {
    const ids = (outcome.competencyIds || []).map(String);
    const impacts = ids.flatMap((competencyId: string) => {
      const competency = competencyById.get(competencyId);
      const score = scoreByCompetency.get(competencyId);
      const evidenceKey = `outcome:${outcome.eventId}:${competencyId}`;
      const evidence = score?.evidence?.find((entry: any) => entry.key === evidenceKey);
      if (!evidence && !outcome.metadata?.competencyAlreadyApplied) return [];
      return [{
        competencyId,
        name: competency?.name,
        code: competency?.code,
        frameworkId: score?.frameworkId || competency?.frameworkId,
        frameworkVersionId: idOf(score?.frameworkVersionId || competency?.frameworkVersionId) || undefined,
        frameworkVersion: score?.frameworkVersion || competency?.frameworkVersion,
        evidenceReference: evidenceKey
      }];
    });
    const metadata = safeMetadata(outcome.metadata);
    const outcomeCompleted = outcome.status === "processed" && outcome.eventType !== "learning.progressed";
    items.push({
      id: `outcome:${outcome.eventId}`,
      source: "learning_outcome",
      sourceId: outcome.eventId,
      resourceId: outcome.resourceId,
      resourceType: outcome.resourceType,
      eventType: outcome.eventType,
      title: String(metadata?.title || metadata?.labTitle || `${outcome.eventType}`),
      category: String(metadata?.category || metadata?.labCategory || outcome.resourceType),
      status: outcomeCompleted ? "completed" : normalizedStatus(outcome.status),
      sourceStatus: outcome.status,
      progress: outcome.progressPercent == null ? undefined : outcome.progressPercent,
      completedAt: outcomeCompleted ? asDate(outcome.occurredAt) : undefined,
      occurredAt: asDate(outcome.occurredAt),
      score: outcome.outcomeScore == null ? undefined : outcome.outcomeScore,
      outcome: outcome.eventType,
      competencyImpact: impacts.length ? impacts : undefined,
      evidenceReference: outcome.eventId,
      personalization: outcome.personalizationTrace?.adaptive ? {
        traceReference: String(outcome.personalizationTrace.traceReference || outcome.eventId),
        adaptiveAction: String(outcome.personalizationTrace.adaptive.decision || ""),
        performanceBand: String(outcome.personalizationTrace.adaptive.performanceBand || ""),
        confidence: String(outcome.personalizationTrace.adaptive.confidence || ""),
        fallbackUsed: Boolean(outcome.personalizationTrace.adaptive.fallbackUsed)
      } : undefined,
      metadata
    });
  }

  for (const row of progress) {
    const resourceKey = `${row.resourceType === "virtual_lab" ? "lab" : row.resourceType === "igot_course" || row.resourceType === "nssta_course" ? "course" : row.resourceType}:${row.resourceId}`;
    const matchingOutcome = outcomeByResource.get(resourceKey);
    if (matchingOutcome && row.status === "completed") continue;
    const course = row.resourceType === "platform_course" ? courseByCode.get(row.resourceId) : undefined;
    const lecture = row.resourceType === "lecture" || row.resourceType === "learning_material" ? lectureById.get(row.resourceId) : undefined;
    const title = String(row.metadata?.title || course?.title || lecture?.title || row.resourceId);
    const source: LearningHistorySource = row.resourceType === "igot_course" ? "igot" : row.resourceType === "nssta_course" ? "nssta" : row.resourceType === "lecture" || row.resourceType === "learning_material" ? "lecture" : row.resourceType === "platform_course" ? "platform" : row.resourceType === "training" ? "training" : "learning_activity";
    items.push({
      id: `progress:${row.resourceType}:${row.resourceId}`,
      source,
      sourceId: row._id.toString(),
      resourceId: row.resourceId,
      resourceType: row.resourceType,
      title,
      category: row.resourceType,
      status: normalizedStatus(row.status),
      sourceStatus: row.status,
      progress: row.progressPercent,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      occurredAt: asDate(row.lastActivityAt || (row as any).updatedAt),
      durationMinutes: Number(row.metadata?.minutes || 0) || undefined,
      metadata: safeMetadata(row.metadata)
    });
  }

  for (const attempt of attempts) {
    if (attempt.status === "passed" && outcomeByResource.has(`lab:${attempt.labId}`)) continue;
    items.push({
      id: `lab-attempt:${attempt._id}`,
      source: "virtual_lab",
      sourceId: String(attempt._id),
      resourceId: attempt.labId,
      resourceType: "virtual_lab",
      title: `Virtual lab — ${attempt.labId}`,
      status: normalizedStatus(attempt.status, attempt.status === "passed"),
      sourceStatus: attempt.status,
      progress: attempt.status === "passed" ? 100 : attempt.status === "failed" ? 50 : undefined,
      startedAt: attempt.startedAt || undefined,
      completedAt: attempt.completedAt || undefined,
      occurredAt: asDate(attempt.completedAt || attempt.submittedAt || attempt.startedAt),
      score: attempt.score,
      outcome: attempt.failureReason || undefined,
      metadata: safeMetadata({ attemptNumber: attempt.attemptNumber, feedback: attempt.feedback })
    });
  }

  for (const assessment of assessments) {
    if (assessment.status === "completed" && outcomeByResource.has(`assessment:${assessment._id}`)) continue;
    const score = assessment.results?.length ? Math.round(assessment.results.reduce((sum: number, result: any) => sum + Number(result.accuracy || 0), 0) / assessment.results.length) : undefined;
    items.push({
      id: `assessment:${assessment._id}`,
      source: "assessment",
      sourceId: String(assessment._id),
      resourceId: String(assessment._id),
      resourceType: "assessment",
      title: "Competency assessment",
      status: normalizedStatus(assessment.status),
      sourceStatus: assessment.status,
      progress: assessment.status === "completed" ? 100 : undefined,
      startedAt: assessment.startedAt || undefined,
      completedAt: assessment.completedAt || undefined,
      occurredAt: asDate(assessment.completedAt || assessment.startedAt || assessment.updatedAt),
      score,
      metadata: safeMetadata({ topic: assessment.blueprintId, frameworkVersion: assessment.blueprintVersion })
    });
  }

  for (const attempt of quizAttempts) {
    const quiz = quizById.get(String(attempt.quizId));
    const matchingOutcome = outcomes.find((outcome: any) => outcome.resourceType === "quiz" && String(outcome.metadata?.attemptId || "") === String(attempt._id));
    if (matchingOutcome) continue;
    items.push({
      id: `quiz:${attempt._id}`,
      source: "quiz",
      sourceId: String(attempt._id),
      resourceId: String(attempt.quizId),
      resourceType: "quiz",
      title: quiz?.title || "Formal quiz",
      category: quiz?.topic,
      status: normalizedStatus(attempt.passed ? "passed" : "completed", attempt.passed),
      sourceStatus: attempt.passed ? "passed" : "completed",
      progress: attempt.percentage,
      completedAt: asDate(attempt.createdAt),
      occurredAt: asDate(attempt.createdAt),
      score: attempt.percentage,
      metadata: safeMetadata({ topic: quiz?.topic, category: quiz?.difficulty })
    });
  }

  for (const enrollment of igot) {
    if (enrollment.status === "completed" && outcomeByResource.has(`course:${enrollment.courseId}`)) continue;
    items.push({
      id: `igot:${enrollment._id}`,
      source: "igot",
      sourceId: String(enrollment._id),
      resourceId: enrollment.courseId,
      resourceType: "igot_course",
      title: enrollment.title || enrollment.courseId,
      status: normalizedStatus(enrollment.status),
      sourceStatus: enrollment.status,
      progress: enrollment.progressPercent,
      completedAt: enrollment.completedAt || undefined,
      occurredAt: asDate(enrollment.completedAt || enrollment.updatedAt),
      metadata: safeMetadata({ providerSource: enrollment.source })
    });
  }
  for (const enrollment of nssta) {
    if (enrollment.status === "completed" && outcomeByResource.has(`training:${enrollment.programmeId}`)) continue;
    items.push({
      id: `nssta:${enrollment._id}`,
      source: "nssta",
      sourceId: String(enrollment._id),
      resourceId: enrollment.programmeId,
      resourceType: "nssta_course",
      title: enrollment.title || enrollment.programmeId,
      status: normalizedStatus(enrollment.status),
      sourceStatus: enrollment.status,
      progress: enrollment.progressPercent,
      completedAt: enrollment.completedAt || undefined,
      occurredAt: asDate(enrollment.completedAt || enrollment.updatedAt),
      metadata: safeMetadata({ providerSource: enrollment.source })
    });
  }

  for (const activity of activities) {
    const meta = (activity.meta || {}) as Record<string, unknown>;
    if (meta.resourceType && meta.resourceId && ["completed", "passed"].includes(String(meta.status || "")) && outcomeByResource.has(`${meta.resourceType === "virtual_lab" ? "lab" : meta.resourceType}:${meta.resourceId}`)) continue;
    items.push({
      id: `activity:${activity._id}`,
      source: activity.type === "lab" ? "virtual_lab" : activity.type === "course" ? "platform" : activity.type === "training" ? "training" : activity.type === "quiz" ? "quiz" : activity.type === "assessment" ? "assessment" : "learning_activity",
      sourceId: String(activity._id),
      resourceId: typeof meta.resourceId === "string" ? meta.resourceId : undefined,
      resourceType: typeof meta.resourceType === "string" ? meta.resourceType : activity.type,
      title: activity.type.replace(/_/g, " "),
      status: normalizedStatus(String(meta.status || "in_progress")),
      sourceStatus: String(meta.status || "recorded"),
      progress: typeof meta.progressPercent === "number" ? meta.progressPercent : undefined,
      occurredAt: asDate(activity.occurredAt),
      durationMinutes: activity.minutes || undefined,
      metadata: safeMetadata(meta)
    });
  }

  let normalized = deduplicateHistoryItems(items).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  if (query.source) normalized = normalized.filter((item) => item.source === query.source);
  if (query.resourceType) normalized = normalized.filter((item) => item.resourceType === query.resourceType);
  if (query.status) normalized = normalized.filter((item) => item.status === query.status);
  const total = normalized.length;
  const start = (page - 1) * limit;
  return {
    items: normalized.slice(start, start + limit),
    pagination: { page, limit, total, hasMore: start + limit < total }
  };
}
