import assert from "node:assert/strict";
import test from "node:test";
import * as foundation from "./analytics-foundation.service";
import { CompetencyScoreModel, SkillGapModel } from "../models/sih/SihModels";
import { getLearnerPerformanceAnalytics } from "./learner-analytics.service";

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "record-1",
    source: "learning_outcome",
    sourceId: "outcome-1",
    resourceId: "resource-1",
    resourceType: "quiz",
    eventType: "quiz.completed",
    status: "completed",
    occurredAt: new Date("2026-09-05T00:00:00Z"),
    score: 80,
    progress: undefined,
    durationMinutes: 20,
    competencyIds: ["competency-1"],
    evidenceReference: "outcome:1",
    traceReference: "outcome-1",
    validatedOutcome: true,
    ...overrides
  };
}

function foundationResult(records: any[], from = new Date("2026-09-01T00:00:00Z"), to = new Date("2026-09-30T00:00:00Z")) {
  return {
    dateRange: { from, to, days: (to.getTime() - from.getTime()) / 86400000 },
    records,
    performanceSnapshot: {
      history: [{ capturedAt: new Date("2026-09-05T00:00:00Z"), overallLearningPercent: 70, competencyAchievementPercent: 60, quizAveragePercentage: 80, learningHours: 2 }]
    }
  };
}

function patchReadModels(restores: Array<() => void>, scores: any[] = [], gaps: any[] = []) {
  patch(CompetencyScoreModel, "find", () => ({
    select: () => ({ lean: async () => scores })
  }), restores);
  patch(SkillGapModel, "find", () => ({
    select: () => ({ lean: async () => gaps })
  }), restores);
}

test("learner analytics aggregates summary, quiz, assessment, lab, progress, and outcomes", async () => {
  const restores: Array<() => void> = [];
  const records = [
    record({ id: "quiz-1", source: "quiz", sourceId: "quiz-1", resourceType: "quiz", score: 80, status: "passed", progress: 80 }),
    record({ id: "assessment-1", source: "assessment", sourceId: "assessment-1", resourceType: "assessment", eventType: "assessment.completed", score: 70 }),
    record({ id: "lab-fail", source: "virtual_lab", sourceId: "attempt-1", resourceType: "virtual_lab", eventType: undefined, status: "failed", score: 40, progress: undefined, validatedOutcome: false }),
    record({ id: "lab-pass", source: "learning_outcome", sourceId: "lab-outcome", resourceType: "lab", eventType: "lab.completed", score: 90 }),
    record({ id: "course-progress", source: "platform", sourceId: "progress-1", resourceType: "platform_course", eventType: undefined, status: "in_progress", progress: 45, score: undefined, validatedOutcome: false, durationMinutes: 30 })
  ];
  patch(foundation, "getLearnerAnalyticsFoundation", async () => foundationResult(records), restores);
  patchReadModels(restores, [], [{ competencyId: "competency-1", gap: 2, priority: "medium", currentLevel: 1, requiredLevel: 3 }]);
  try {
    const result = await getLearnerPerformanceAnalytics("learner-1", { compare: false, now: new Date("2026-09-30T00:00:00Z") });
    assert.equal(result.summary.validatedOutcomes, 3);
    assert.equal(result.quiz.attemptCount, 1);
    assert.equal(result.assessment.attemptCount, 1);
    assert.equal(result.virtualLab.attemptCount, 2);
    assert.equal(result.virtualLab.failedCount, 1);
    assert.equal(result.virtualLab.passedCount, 1);
    assert.equal(result.learningProgress.records.length, 1);
    assert.equal(result.validatedOutcomes.byType["lab.completed"], 1);
    assert.equal(result.skillGaps.currentGapCount, 1);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("formal assessment analytics uses assessment records and competency history reports observed improvement", async () => {
  const restores: Array<() => void> = [];
  const assessment = record({ source: "assessment", resourceType: "assessment", eventType: "assessment.completed", score: 88 });
  patch(foundation, "getLearnerAnalyticsFoundation", async () => foundationResult([assessment]), restores);
  patchReadModels(restores, [{
    competencyId: "competency-1",
    frameworkId: "framework-1",
    frameworkVersionId: "version-1",
    frameworkVersion: "1.0",
    history: [
      { date: new Date("2026-08-01T00:00:00Z"), level: 1, source: "assessment" },
      { date: new Date("2026-09-05T00:00:00Z"), level: 3, source: "assessment" }
    ]
  }], []);
  try {
    const result = await getLearnerPerformanceAnalytics("learner-1", { compare: false, from: "2026-09-01T00:00:00Z", to: "2026-09-30T00:00:00Z", now: new Date("2026-09-30T00:00:00Z") });
    assert.equal(result.assessment.averageScore, 88);
    assert.equal(result.competencyImprovement.items.length, 1);
    assert.equal(result.competencyImprovement.items[0].delta, 2);
    assert.equal(result.competencyImprovement.items[0].frameworkVersion, "1.0");
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("period comparison reports deltas and insufficient percentage change safely", async () => {
  const restores: Array<() => void> = [];
  let call = 0;
  patch(foundation, "getLearnerAnalyticsFoundation", async () => {
    call += 1;
    return call === 1
      ? foundationResult([record({ score: 80 })])
      : foundationResult([record({ id: "previous", sourceId: "previous", score: 0, validatedOutcome: true })], new Date("2026-08-02T00:00:00Z"), new Date("2026-09-01T00:00:00Z"));
  }, restores);
  patchReadModels(restores);
  try {
    const result = await getLearnerPerformanceAnalytics("learner-1", { compare: true, from: "2026-09-01T00:00:00Z", to: "2026-09-30T00:00:00Z", now: new Date("2026-09-30T00:00:00Z") });
    const quizComparison = result.comparison.metrics.find((metric: any) => metric.metric === "quizAverage")!;
    assert.equal(quizComparison.direction, "improved");
    assert.equal(quizComparison.delta, 80);
    assert.equal(quizComparison.percentageDelta, undefined);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("empty analytics explicitly reports insufficient data without synthetic trend points", async () => {
  const restores: Array<() => void> = [];
  patch(foundation, "getLearnerAnalyticsFoundation", async () => ({ ...foundationResult([]), performanceSnapshot: { history: [] } }), restores);
  patchReadModels(restores);
  try {
    const result = await getLearnerPerformanceAnalytics("learner-1", { compare: false });
    assert.equal(result.summary.dataSufficiency.hasData, false);
    assert.equal(result.performance.trend.length, 0);
    assert.equal(result.quiz.dataSufficiency.evidenceLevel, "none");
    assert.equal(result.validatedOutcomes.total, 0);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("analytics read path does not expose raw lab submission fields", async () => {
  const restores: Array<() => void> = [];
  patch(foundation, "getLearnerAnalyticsFoundation", async () => foundationResult([record({ source: "virtual_lab", resourceType: "virtual_lab", metadata: { feedback: "Review the assertion" } })]), restores);
  patchReadModels(restores);
  try {
    const result = await getLearnerPerformanceAnalytics("learner-1", { compare: false });
    const serialized = JSON.stringify(result);
    for (const field of ["code", "answer", "answers", "rawCode", "rawAnswers", "submission"]) {
      assert.equal(serialized.includes(`\"${field}\"`), false);
    }
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
