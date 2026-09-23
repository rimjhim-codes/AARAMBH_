import {
  getUnifiedLearningHistory,
  HISTORY_SOURCES,
  normalizeHistoryStatus,
  type LearningHistoryItem,
  type LearningHistorySource
} from "./learning-history.service";
import { getStoredPerformance } from "./performance.service";

export const ANALYTICS_DEFAULT_RANGE_DAYS = 90;
export const ANALYTICS_MAX_RANGE_DAYS = 365;
export const ANALYTICS_DEFAULT_LIMIT = 100;
export const ANALYTICS_MAX_LIMIT = 250;

export const ANALYTICS_SOURCES = HISTORY_SOURCES;
export type AnalyticsSource = LearningHistorySource;
export type AnalyticsStatus = "not_started" | "in_progress" | "completed" | "passed" | "failed" | "abandoned" | "recorded";

export type AnalyticsDateRangeInput = {
  from?: unknown;
  to?: unknown;
  now?: Date;
};

export type AnalyticsDateRange = {
  from: Date;
  to: Date;
  days: number;
};

export type AnalyticsQuery = AnalyticsDateRangeInput & {
  source?: AnalyticsSource;
  status?: AnalyticsStatus;
  limit?: number;
};

export type AnalyticsLearningRecord = {
  id: string;
  source: AnalyticsSource;
  sourceId: string;
  resourceId?: string;
  resourceType?: string;
  eventType?: string;
  status: AnalyticsStatus;
  sourceStatus?: string;
  occurredAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress?: number;
  score?: number;
  durationMinutes?: number;
  outcome?: string;
  competencyIds: string[];
  evidenceReference?: string;
  traceReference?: string;
  validatedOutcome: boolean;
  metadata?: Record<string, unknown>;
};

export type AnalyticsFoundation = {
  dateRange: AnalyticsDateRange;
  records: AnalyticsLearningRecord[];
  performanceSnapshot: unknown;
};

export class AnalyticsDateRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalyticsDateRangeError";
  }
}

export class AnalyticsAuthorizationError extends Error {
  constructor(message = "Analytics access is not authorized for this learner scope.") {
    super(message);
    this.name = "AnalyticsAuthorizationError";
  }
}

function parseDate(value: unknown, field: string): Date | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = value instanceof Date ? new Date(value.getTime()) : new Date(String(value));
  if (Number.isNaN(parsed.getTime())) throw new AnalyticsDateRangeError(`${field} must be a valid date.`);
  return parsed;
}

export function createAnalyticsDateRange(input: AnalyticsDateRangeInput = {}): AnalyticsDateRange {
  const now = input.now ? parseDate(input.now, "now")! : new Date();
  const to = parseDate(input.to, "to") || now;
  const from = parseDate(input.from, "from") || new Date(to.getTime() - ANALYTICS_DEFAULT_RANGE_DAYS * 86400000);

  if (from > to) throw new AnalyticsDateRangeError("Analytics start date must be before the end date.");
  if (to > now) throw new AnalyticsDateRangeError("Analytics end date cannot be in the future.");

  const days = (to.getTime() - from.getTime()) / 86400000;
  if (days > ANALYTICS_MAX_RANGE_DAYS) {
    throw new AnalyticsDateRangeError(`Analytics range cannot exceed ${ANALYTICS_MAX_RANGE_DAYS} days.`);
  }
  return { from, to, days };
}

const SOURCE_ALIASES: Record<string, AnalyticsSource> = {
  platform: "platform",
  platform_course: "platform",
  lecture: "lecture",
  learning_material: "lecture",
  quiz: "quiz",
  formal_quiz: "quiz",
  assessment: "assessment",
  formal_assessment: "assessment",
  virtual_lab: "virtual_lab",
  lab: "virtual_lab",
  training: "training",
  nssta: "nssta",
  nssta_course: "nssta",
  tpac: "nssta",
  igot: "igot",
  igot_course: "igot",
  learning_activity: "learning_activity",
  learning_outcome: "learning_outcome"
};

export function normalizeAnalyticsSource(value: unknown): AnalyticsSource {
  const normalized = String(value || "").trim().toLowerCase();
  return SOURCE_ALIASES[normalized] || "learning_activity";
}

export function normalizeAnalyticsStatus(value: unknown, passed?: boolean): AnalyticsStatus {
  const normalized = normalizeHistoryStatus(String(value || ""), passed);
  if (["not_started", "in_progress", "completed", "passed", "failed", "abandoned", "recorded"].includes(normalized)) {
    return normalized as AnalyticsStatus;
  }
  return "recorded";
}

function normalizeHistoryRecord(item: LearningHistoryItem): AnalyticsLearningRecord {
  const competencyIds = (item.competencyImpact || []).map((impact) => String(impact.competencyId));
  const validatedOutcome = item.source === "learning_outcome"
    && item.eventType !== "learning.progressed"
    && ["completed", "passed"].includes(normalizeAnalyticsStatus(item.status));
  return {
    id: item.id,
    source: normalizeAnalyticsSource(item.source),
    sourceId: item.sourceId,
    resourceId: item.resourceId,
    resourceType: item.resourceType,
    eventType: item.eventType,
    status: normalizeAnalyticsStatus(item.status),
    sourceStatus: item.sourceStatus,
    occurredAt: item.occurredAt,
    startedAt: item.startedAt,
    completedAt: item.completedAt,
    progress: item.progress,
    score: item.score,
    durationMinutes: item.durationMinutes,
    outcome: item.outcome,
    competencyIds,
    evidenceReference: item.evidenceReference || item.competencyImpact?.[0]?.evidenceReference,
    traceReference: item.personalization?.traceReference,
    validatedOutcome,
    metadata: item.metadata
  };
}

/**
 * Resolves the only learner scope a caller may read. Admin aggregation is an
 * explicit future capability; this helper keeps that boundary testable without
 * exposing an admin-wide endpoint in the foundation phase.
 */
export function resolveAnalyticsUserScope(input: {
  authenticatedUserId: string;
  requestedUserId?: string;
  roles?: string[];
}) {
  const authenticatedUserId = String(input.authenticatedUserId || "");
  const requestedUserId = input.requestedUserId ? String(input.requestedUserId) : authenticatedUserId;
  if (!authenticatedUserId) throw new AnalyticsAuthorizationError("Authenticated learner identity is required.");
  if (requestedUserId !== authenticatedUserId && !input.roles?.includes("admin")) {
    throw new AnalyticsAuthorizationError();
  }
  return requestedUserId;
}

/**
 * Read-only analytics foundation. Unified Learning History remains the source
 * normalization and deduplication layer; this service only maps its bounded
 * records and reads the latest stored performance snapshot.
 */
export async function getLearnerAnalyticsFoundation(userId: string, query: AnalyticsQuery = {}): Promise<AnalyticsFoundation> {
  const scopedUserId = resolveAnalyticsUserScope({ authenticatedUserId: userId });
  const dateRange = createAnalyticsDateRange(query);
  const limit = Math.min(ANALYTICS_MAX_LIMIT, Math.max(1, Math.floor(query.limit || ANALYTICS_DEFAULT_LIMIT)));
  const history = await getUnifiedLearningHistory(scopedUserId, {
    from: dateRange.from,
    to: dateRange.to,
    source: query.source,
    status: query.status,
    page: 1,
    limit
  });
  const records = history.items.map(normalizeHistoryRecord);
  const performanceSnapshot = await getStoredPerformance(scopedUserId);
  return { dateRange, records, performanceSnapshot };
}

export function normalizeAnalyticsRecord(item: LearningHistoryItem) {
  return normalizeHistoryRecord(item);
}
