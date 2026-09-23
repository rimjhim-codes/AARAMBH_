import { CompetencyScoreModel, SkillGapModel } from "../models/sih/SihModels";
import * as foundation from "./analytics-foundation.service";
import {
  getLearnerAnalyticsFoundation,
  normalizeAnalyticsStatus,
  type AnalyticsDateRange,
  type AnalyticsFoundation,
  type AnalyticsLearningRecord,
  type AnalyticsQuery,
  type AnalyticsStatus
} from "./analytics-foundation.service";

export type LearnerAnalyticsQuery = AnalyticsQuery & {
  compare?: boolean;
  comparisonDays?: number;
  competencyId?: string;
};

type Sufficiency = {
  hasData: boolean;
  sampleSize: number;
  evidenceLevel: "none" | "limited" | "sufficient";
  limitation?: string;
};

type TrendPoint = {
  date: Date;
  score?: number;
  passed?: boolean;
  overallLearningPercent?: number;
  competencyAchievementPercent?: number;
  quizAveragePercentage?: number;
  learningHours?: number;
};

function sufficiency(sampleSize: number, limitation?: string): Sufficiency {
  return {
    hasData: sampleSize > 0,
    sampleSize,
    evidenceLevel: sampleSize === 0 ? "none" : sampleSize < 2 ? "limited" : "sufficient",
    ...(limitation ? { limitation } : {})
  };
}

function finiteScores(records: AnalyticsLearningRecord[]) {
  return records.map((record) => record.score).filter((score): score is number => Number.isFinite(score));
}

function average(values: number[]) {
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : undefined;
}

function best(values: number[]) {
  return values.length ? Math.max(...values) : undefined;
}

function recent(records: AnalyticsLearningRecord[]) {
  return records.slice().sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
}

function isOutcome(record: AnalyticsLearningRecord, eventType: string) {
  return record.eventType === eventType
    || (record.source === "learning_outcome" && record.eventType === eventType);
}

function isQuiz(record: AnalyticsLearningRecord) {
  return record.source === "quiz" || isOutcome(record, "quiz.completed");
}

function isAssessment(record: AnalyticsLearningRecord) {
  return record.source === "assessment" || isOutcome(record, "assessment.completed");
}

function isLab(record: AnalyticsLearningRecord) {
  return record.source === "virtual_lab" || isOutcome(record, "lab.completed");
}

function isCompleted(record: AnalyticsLearningRecord) {
  return ["completed", "passed"].includes(normalizeAnalyticsStatus(record.status));
}

function isFailed(record: AnalyticsLearningRecord) {
  return normalizeAnalyticsStatus(record.status) === "failed";
}

function metricSnapshot(records: AnalyticsLearningRecord[]) {
  const quiz = records.filter(isQuiz);
  const assessment = records.filter(isAssessment);
  const lab = records.filter(isLab);
  const durations = records.map((record) => Number(record.durationMinutes || 0)).filter((value) => value > 0);
  return {
    learningRecords: records.length,
    validatedOutcomes: records.filter((record) => record.validatedOutcome).length,
    completedLearningItems: records.filter(isCompleted).length,
    passedItems: records.filter((record) => normalizeAnalyticsStatus(record.status) === "passed").length,
    failedItems: records.filter(isFailed).length,
    learningMinutes: Math.round(durations.reduce((sum, value) => sum + value, 0) * 10) / 10,
    quizAverage: average(finiteScores(quiz)),
    assessmentAverage: average(finiteScores(assessment)),
    labAverage: average(finiteScores(lab))
  };
}

function comparisonMetric(metric: string, current: number | undefined, previous: number | undefined) {
  if (current === undefined || previous === undefined) {
    return { metric, current, previous, delta: undefined, percentageDelta: undefined, direction: "insufficient_data" as const };
  }
  const delta = Math.round((current - previous) * 10) / 10;
  const percentageDelta = previous === 0 ? undefined : Math.round((delta / Math.abs(previous)) * 1000) / 10;
  return {
    metric,
    current,
    previous,
    delta,
    percentageDelta,
    direction: delta > 0 ? "improved" as const : delta < 0 ? "declined" as const : "unchanged" as const
  };
}

function previousRange(range: AnalyticsDateRange, days: number): AnalyticsDateRange {
  const to = new Date(range.from.getTime());
  const from = new Date(to.getTime() - days * 86400000);
  return { from, to, days };
}

function snapshotTrend(snapshot: any, range: AnalyticsDateRange): TrendPoint[] {
  return (snapshot?.history || [])
    .map((point: any) => ({ ...point, date: new Date(point.capturedAt) }))
    .filter((point: TrendPoint) => !Number.isNaN(point.date.getTime()) && point.date >= range.from && point.date <= range.to)
    .sort((a: TrendPoint, b: TrendPoint) => a.date.getTime() - b.date.getTime());
}

function recordTrend(records: AnalyticsLearningRecord[], predicate: (record: AnalyticsLearningRecord) => boolean) {
  return records
    .filter((record) => predicate(record) && record.score !== undefined)
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime())
    .map((record) => ({ date: record.occurredAt, score: record.score, passed: record.status === "passed" || record.validatedOutcome }));
}

function extractImprovement(scores: any[], records: AnalyticsLearningRecord[], range: AnalyticsDateRange, competencyId?: string) {
  const improvements: Array<Record<string, unknown>> = [];
  for (const score of scores) {
    const id = String(score.competencyId?._id || score.competencyId);
    if (competencyId && id !== competencyId) continue;
    const history = (score.history || [])
      .map((entry: any) => ({ ...entry, date: new Date(entry.date) }))
      .filter((entry: any) => !Number.isNaN(entry.date.getTime()))
      .sort((a: any, b: any) => a.date.getTime() - b.date.getTime());
    const inRange = history.filter((entry: any) => entry.date >= range.from && entry.date <= range.to);
    const before = history.filter((entry: any) => entry.date < range.from).at(-1);
    if (!inRange.length || !before) continue;
    const latest = inRange.at(-1);
    const delta = Number(latest.level) - Number(before.level);
    if (!Number.isFinite(delta) || delta === 0) continue;
    const evidence = records
      .filter((record) => record.competencyIds.includes(id) && record.occurredAt <= latest.date)
      .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0];
    improvements.push({
      competencyId: id,
      previousLevel: Number(before.level),
      currentLevel: Number(latest.level),
      delta,
      changedAt: latest.date,
      evidenceReference: evidence?.evidenceReference,
      outcomeReference: evidence?.validatedOutcome ? evidence.sourceId : undefined,
      frameworkId: score.frameworkId,
      frameworkVersionId: score.frameworkVersionId ? String(score.frameworkVersionId) : undefined,
      frameworkVersion: score.frameworkVersion,
      note: "Observed competency level change associated with stored learning evidence; causation is not established."
    });
  }
  return improvements;
}

async function loadScoresAndGaps(userId: string, competencyId?: string) {
  const filter = { userId, ...(competencyId ? { competencyId } : {}) };
  const [scores, gaps] = await Promise.all([
    CompetencyScoreModel.find(filter).select("competencyId currentLevel targetLevel frameworkId frameworkVersionId frameworkVersion proficiencyScale history evidence").lean(),
    SkillGapModel.find(filter).select("competencyId gap priority currentLevel requiredLevel frameworkId frameworkVersionId frameworkVersion").lean()
  ]);
  return { scores, gaps };
}

function buildAnalyticsSection(records: AnalyticsLearningRecord[], predicate: (record: AnalyticsLearningRecord) => boolean, label: string) {
  const selected = records.filter(predicate);
  const scores = finiteScores(selected);
  const passed = selected.filter((record) => record.validatedOutcome || normalizeAnalyticsStatus(record.status) === "passed").length;
  const failed = selected.filter(isFailed).length;
  const uniqueResources = new Set(selected.map((record) => `${record.resourceType}:${record.resourceId || record.sourceId}`));
  const latest = recent(selected);
  return {
    label,
    attemptCount: selected.length,
    averageScore: average(scores),
    bestScore: best(scores),
    recentScore: latest?.score,
    passedCount: passed,
    failedCount: failed,
    retryCount: Math.max(0, selected.length - uniqueResources.size),
    passRate: selected.length ? Math.round((passed / selected.length) * 1000) / 10 : undefined,
    trend: recordTrend(selected, () => true),
    dataSufficiency: sufficiency(selected.length, selected.length ? undefined : `No ${label.toLowerCase()} records in the selected period.`)
  };
}

export async function getLearnerPerformanceAnalytics(userId: string, query: LearnerAnalyticsQuery = {}) {
  const range = foundation.createAnalyticsDateRange(query);
  const compare = query.compare !== false;
  const comparisonDays = query.comparisonDays || Math.max(1, Math.round(range.days));
  if (!Number.isInteger(comparisonDays) || comparisonDays < 1 || comparisonDays > foundation.ANALYTICS_MAX_RANGE_DAYS) {
    throw new foundation.AnalyticsDateRangeError(`Comparison period must be between 1 and ${foundation.ANALYTICS_MAX_RANGE_DAYS} days.`);
  }

  const currentQuery: LearnerAnalyticsQuery = { ...query, from: range.from, to: range.to, limit: query.limit };
  const current = await getLearnerAnalyticsFoundation(userId, currentQuery);
  const previous = compare
    ? await getLearnerAnalyticsFoundation(userId, { ...query, from: previousRange(range, comparisonDays).from, to: range.from, limit: query.limit })
    : undefined;
  const { scores, gaps } = await loadScoresAndGaps(userId, query.competencyId);
  const summary = metricSnapshot(current.records);
  const previousSummary = previous ? metricSnapshot(previous.records) : undefined;
  const improvements = extractImprovement(scores, current.records, range, query.competencyId);
  const performanceTrend = snapshotTrend(current.performanceSnapshot, range);
  const progressRecords = current.records.filter((record) => record.progress !== undefined
    && record.source !== "learning_outcome"
    && !isQuiz(record)
    && !isAssessment(record));
  const outcomes = current.records
    .filter((record) => record.validatedOutcome)
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
  const outcomeTypeCounts = outcomes.reduce<Record<string, number>>((counts, record) => {
    const key = record.eventType || "unknown";
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const currentMetrics = [
    ["validatedOutcomes", summary.validatedOutcomes],
    ["completedLearningItems", summary.completedLearningItems],
    ["learningMinutes", summary.learningMinutes],
    ["quizAverage", summary.quizAverage],
    ["assessmentAverage", summary.assessmentAverage],
    ["labAverage", summary.labAverage]
  ] as const;
  const comparisons = previousSummary ? currentMetrics.map(([metric, value]) => comparisonMetric(metric, value, previousSummary[metric])) : [];

  return {
    dateRange: range,
    comparison: previousSummary ? {
      enabled: true,
      dateRange: previous!.dateRange,
      metrics: comparisons
    } : { enabled: false, metrics: [] },
    summary: {
      ...summary,
      totalLearningHours: Math.round((summary.learningMinutes / 60) * 10) / 10,
      competencyImprovementCount: improvements.length,
      dataSufficiency: sufficiency(current.records.length, current.records.length ? undefined : "No learning records were found in the selected period.")
    },
    performance: {
      storedSnapshot: current.performanceSnapshot,
      trend: performanceTrend,
      dataSufficiency: sufficiency(performanceTrend.length, performanceTrend.length ? undefined : "No stored performance snapshots exist in the selected period.")
    },
    quiz: buildAnalyticsSection(current.records, isQuiz, "Quiz"),
    assessment: buildAnalyticsSection(current.records, isAssessment, "Formal assessment"),
    virtualLab: buildAnalyticsSection(current.records, isLab, "Virtual lab"),
    learningProgress: {
      records: progressRecords.map((record) => ({
        id: record.id,
        source: record.source,
        resourceId: record.resourceId,
        resourceType: record.resourceType,
        status: record.status,
        progress: record.progress,
        occurredAt: record.occurredAt
      })),
      dataSufficiency: sufficiency(progressRecords.length, progressRecords.length ? undefined : "No progress records exist in the selected period.")
    },
    validatedOutcomes: {
      total: outcomes.length,
      byType: outcomeTypeCounts,
      recent: outcomes.slice(0, 20).map((record) => ({
        id: record.id,
        sourceId: record.sourceId,
        eventType: record.eventType,
        resourceId: record.resourceId,
        resourceType: record.resourceType,
        occurredAt: record.occurredAt,
        score: record.score,
        competencyIds: record.competencyIds,
        evidenceReference: record.evidenceReference,
        traceReference: record.traceReference
      })),
      dataSufficiency: sufficiency(outcomes.length, outcomes.length ? undefined : "No processed validated outcomes exist in the selected period.")
    },
    competencyImprovement: {
      items: improvements,
      dataSufficiency: sufficiency(improvements.length, improvements.length ? undefined : "Competency history does not contain a comparable prior level and current-period change.")
    },
    skillGaps: {
      currentGapCount: gaps.filter((gap: any) => Number(gap.gap) > 0).length,
      gapsRemaining: gaps.filter((gap: any) => Number(gap.gap) > 0).map((gap: any) => ({
        competencyId: String(gap.competencyId),
        gap: gap.gap,
        priority: gap.priority,
        currentLevel: gap.currentLevel,
        requiredLevel: gap.requiredLevel
      })),
      movement: "not_available_without_historical_gap_snapshots",
      dataSufficiency: sufficiency(gaps.length, "Stored skill gaps provide current state only; analytics does not recalculate or infer historical gap movement.")
    },
    limitations: [
      "Analytics reports observed associations from stored records and does not establish causal training effectiveness.",
      "Missing periods are not filled with synthetic zero values.",
      "Skill-gap movement requires historical gap snapshots, which are not currently stored."
    ]
  };
}
