import assert from "node:assert/strict";
import test from "node:test";
import { deduplicateHistoryItems, normalizeHistoryStatus, type LearningHistoryItem } from "./learning-history.service";
import { getUnifiedLearningHistory } from "./learning-history.service";
import * as models from "../models/sih/SihModels";
import { LearningOutcomeEventModel } from "../models/LearningOutcomeEvent";
import { LearningProgressModel } from "../models/LearningProgress";
import { VirtualLabAttemptModel } from "../models/VirtualLabAttempt";

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
}

function query(value: unknown) {
  return {
    sort() { return this; },
    limit() { return this; },
    select() { return this; },
    lean: async () => value
  };
}

function item(overrides: Partial<LearningHistoryItem> = {}): LearningHistoryItem {
  return {
    id: "1",
    source: "learning_outcome",
    sourceId: "event-1",
    title: "Quiz",
    status: "completed",
    occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

test("history status normalization preserves meaningful outcome states", () => {
  assert.equal(normalizeHistoryStatus("passed"), "passed");
  assert.equal(normalizeHistoryStatus("failed"), "failed");
  assert.equal(normalizeHistoryStatus("in_progress"), "in_progress");
  assert.equal(normalizeHistoryStatus("completed"), "completed");
});

test("history deduplication removes duplicate source events but preserves separate retries", () => {
  const result = deduplicateHistoryItems([
    item(),
    item({ id: "duplicate" }),
    item({ id: "failed-attempt", source: "virtual_lab", sourceId: "attempt-1", eventType: "failed" }),
    item({ id: "passed-attempt", source: "virtual_lab", sourceId: "attempt-2", eventType: "passed" })
  ]);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((entry) => entry.id), ["1", "failed-attempt", "passed-attempt"]);
});

test("history aggregation correlates a completion and keeps a failed lab retry visible", async () => {
  const restores: Array<() => void> = [];
  const userId = "64f000000000000000000001";
  const outcome = {
    _id: "outcome-db-1", eventId: "loe-quiz-1", userId, eventType: "quiz.completed", resourceType: "quiz", resourceId: "quiz-1", source: "arambh", status: "processed", occurredAt: new Date("2026-01-03"), progressPercent: 100, outcomeScore: 88, competencyIds: [], metadata: { title: "Data Quiz", attemptId: "quiz-attempt-1" }, personalizationTrace: { traceReference: "loe-quiz-1", adaptive: { decision: "progress", performanceBand: "proficient", confidence: "high", fallbackUsed: false } }
  };
  const progress = { _id: "progress-1", resourceType: "platform_course", resourceId: "course-1", source: "platform", progressPercent: 40, status: "in_progress", lastActivityAt: new Date("2026-01-02"), metadata: { title: "Python" } };
  const failedAttempt = { _id: "lab-attempt-1", labId: "ai-output-evaluation", attemptNumber: 1, status: "failed", validationPassed: false, score: 40, feedback: "Review relevance.", failureReason: "checkpoint_failed", startedAt: new Date("2026-01-01"), submittedAt: new Date("2026-01-01") };
  patch(models.LearningActivityModel, "find", () => query([]), restores);
  patch(LearningOutcomeEventModel, "find", () => query([outcome]), restores);
  patch(LearningProgressModel, "find", () => query([progress]), restores);
  patch(VirtualLabAttemptModel, "find", () => query([failedAttempt]), restores);
  patch(models.CompetencyAssessmentModel, "find", () => query([]), restores);
  patch(models.FormalQuizAttemptModel, "find", () => query([{ _id: "quiz-attempt-1", quizId: "quiz-1", percentage: 88, passed: true, createdAt: new Date("2026-01-03") }]), restores);
  patch(models.IGOTEnrollmentModel, "find", () => query([]), restores);
  patch(models.NSSTAEnrollmentModel, "find", () => query([]), restores);
  patch(models.PlatformCourseModel, "find", () => query([{ code: "course-1", title: "Python" }]), restores);
  patch(models.FormalQuizModel, "find", () => query([{ _id: "quiz-1", title: "Data Quiz", topic: "Data" }]), restores);
  patch(models.CompetencyModel, "find", () => query([]), restores);
  patch(models.CompetencyScoreModel, "find", () => query([]), restores);
  try {
    const result = await getUnifiedLearningHistory(userId, { page: 1, limit: 20 });
    assert.equal(result.items.filter((item) => item.title === "Data Quiz").length, 1);
    assert.equal(result.items.find((item) => item.title === "Data Quiz")?.personalization?.adaptiveAction, "progress");
    assert.equal(result.items.some((item) => item.status === "failed" && item.source === "virtual_lab"), true);
    assert.equal(result.pagination.total, 3);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
