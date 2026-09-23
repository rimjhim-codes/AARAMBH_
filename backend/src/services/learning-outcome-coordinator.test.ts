import assert from "node:assert/strict";
import test from "node:test";
import { LearningOutcomeEventModel } from "../models/LearningOutcomeEvent";
import * as competencyService from "./competency.service";
import * as recommendationService from "./recommendation.service";
import * as performanceService from "./performance.service";
import * as adaptiveService from "./adaptive-learning.service";
import { processLearningOutcome } from "./learning-outcome-coordinator.service";

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    eventId: "loe-1",
    userId: "64f000000000000000000001",
    eventType: "quiz.completed",
    resourceType: "quiz",
    resourceId: "quiz-1",
    source: "arambh",
    outcomeScore: 80,
    competencyIds: ["64f000000000000000000101"],
    metadata: { topic: "Statistics" },
    ...overrides
  };
}

function queryResult(value: unknown) {
  return { lean: async () => value };
}

test("processes a new quiz outcome through each downstream stage once", async () => {
  const restores: Array<() => void> = [];
  const calls = { claim: 0, finalized: 0, competency: 0, gaps: 0, recommendations: 0, performance: 0 };
  let gapScope: any;
  let recommendationScope: any;
  patch(LearningOutcomeEventModel, "findOneAndUpdate", (_filter: any, update: any) => {
    calls.claim += 1;
    if (update.$set?.status === "processed") calls.finalized += 1;
    return calls.claim === 1 ? queryResult(event()) : event();
  }, restores);
  patch(LearningOutcomeEventModel, "findOne", () => { throw new Error("should not load an already-processed event"); }, restores);
  patch(competencyService, "applyQuizCompetencyImpact", async () => { calls.competency += 1; return {}; }, restores);
  patch(competencyService, "recalculateSkillGaps", async (_userId: string, scope: any) => { gapScope = scope; calls.gaps += 1; return [{ _id: "gap-1", competencyId: "64f000000000000000000101" }]; }, restores);
  patch(recommendationService, "generatePersonalizedLearningPath", async (_userId: string, scope: any) => { recommendationScope = scope; calls.recommendations += 1; return [{ _id: "recommendation-1", competencyId: "64f000000000000000000101" }]; }, restores);
  patch(performanceService, "recalculatePerformance", async () => { calls.performance += 1; return {}; }, restores);
  patch(adaptiveService, "getNextAdaptiveLearningDecision", async () => ({ decision: "progress", performanceBand: "proficient", confidence: "high", fallbackUsed: false, resource: { id: "rec-1" } }), restores);
  try {
    const result = await processLearningOutcome("loe-1");
    assert.deepEqual(result, {
      eventId: "loe-1",
      status: "processed",
      competencyUpdated: true,
      skillGapsRefreshed: true,
      recommendationsRefreshed: true,
      performanceRefreshed: true
    });
    assert.deepEqual(calls, { claim: 2, finalized: 1, competency: 1, gaps: 1, recommendations: 1, performance: 1 });
    assert.deepEqual(gapScope, { competencyIds: ["64f000000000000000000101"] });
    assert.deepEqual(recommendationScope, { competencyIds: ["64f000000000000000000101"] });
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("ignores an already processed or concurrently processing event", async () => {
  const restores: Array<() => void> = [];
  patch(LearningOutcomeEventModel, "findOneAndUpdate", () => queryResult(null), restores);
  patch(LearningOutcomeEventModel, "findOne", () => ({
    select: () => ({ lean: async () => ({ eventId: "loe-1", status: "processed" }) })
  }), restores);
  try {
    const result = await processLearningOutcome("loe-1");
    assert.equal(result.status, "already_processed");
    assert.equal(result.skillGapsRefreshed, false);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("learning progress is recorded as processed without competency or downstream refresh", async () => {
  const restores: Array<() => void> = [];
  const updates: any[] = [];
  patch(LearningOutcomeEventModel, "findOneAndUpdate", (_filter: any, update: any) => {
    updates.push(update);
    return updates.length === 1
      ? queryResult(event({ eventType: "learning.progressed", resourceType: "learning_activity", competencyIds: [] }))
      : event({ eventType: "learning.progressed", resourceType: "learning_activity", competencyIds: [] });
  }, restores);
  try {
    const result = await processLearningOutcome("loe-1");
    assert.equal(result.competencyUpdated, false);
    assert.equal(result.performanceRefreshed, false);
    assert.equal(updates.length, 2);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("downstream failure leaves the event failed and retryable", async () => {
  const restores: Array<() => void> = [];
  const updates: any[] = [];
  patch(LearningOutcomeEventModel, "findOneAndUpdate", (_filter: any, update: any) => {
    updates.push(update);
    return updates.length === 1 ? queryResult(event()) : Promise.resolve(event());
  }, restores);
  patch(competencyService, "applyQuizCompetencyImpact", async () => ({}), restores);
  patch(competencyService, "recalculateSkillGaps", async () => { throw new Error("gap refresh failed"); }, restores);
  try {
    await assert.rejects(() => processLearningOutcome("loe-1"), /gap refresh failed/);
    assert.equal(updates.at(-1).$set.status, "failed");
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("assessment events with existing locked completion evidence refresh downstream once", async () => {
  const restores: Array<() => void> = [];
  const calls = { gaps: 0, recommendations: 0, performance: 0 };
  patch(LearningOutcomeEventModel, "findOneAndUpdate", () => queryResult(event({
    eventType: "assessment.completed",
    resourceType: "assessment",
    metadata: { competencyAlreadyApplied: true }
  })), restores);
  patch(competencyService, "recalculateSkillGaps", async () => { calls.gaps += 1; return []; }, restores);
  patch(recommendationService, "generatePersonalizedLearningPath", async () => { calls.recommendations += 1; return []; }, restores);
  patch(performanceService, "recalculatePerformance", async () => { calls.performance += 1; return {}; }, restores);
  patch(adaptiveService, "getNextAdaptiveLearningDecision", async () => ({ decision: "reassess", performanceBand: "developing", confidence: "medium", fallbackUsed: false }), restores);
  try {
    const result = await processLearningOutcome("loe-1");
    assert.equal(result.competencyUpdated, true);
    assert.deepEqual(calls, { gaps: 1, recommendations: 1, performance: 1 });
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("successful outcome stores a closed-loop trace and isolates adaptive failure", async () => {
  const restores: Array<() => void> = [];
  const updates: any[] = [];
  patch(LearningOutcomeEventModel, "findOneAndUpdate", (_filter: any, update: any) => {
    updates.push(update);
    return updates.length === 1 ? queryResult(event({ competencyIds: ["comp-1"] })) : event();
  }, restores);
  patch(competencyService, "applyQuizCompetencyImpact", async () => ({}), restores);
  patch(competencyService, "recalculateSkillGaps", async () => [{ _id: "gap-1" }], restores);
  patch(recommendationService, "generatePersonalizedLearningPath", async () => [{ _id: "recommendation-1", competencyId: "comp-1" }], restores);
  patch(performanceService, "recalculatePerformance", async () => ({}), restores);
  patch(adaptiveService, "getNextAdaptiveLearningDecision", async () => { throw new Error("adaptive unavailable"); }, restores);
  try {
    const result = await processLearningOutcome("loe-1");
    assert.equal(result.status, "processed");
    assert.equal(updates.at(-1).$set.status, "processed");
    assert.equal(updates.at(-1).$set.personalizationTrace.adaptiveAvailable, false);
    assert.deepEqual(updates.at(-1).$set.personalizationTrace.affectedCompetencyIds, ["comp-1"]);
    assert.equal(updates.at(-1).$set.personalizationTrace.scope, "affected");
    assert.equal(updates.at(-1).$set.personalizationTrace.scopeFallback, false);
    assert.deepEqual(updates.at(-1).$set.personalizationTrace.gapIds, ["gap-1"]);
    assert.deepEqual(updates.at(-1).$set.personalizationTrace.recommendationIds, ["recommendation-1"]);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("records controlled fallback when validated outcome has no competency mapping", async () => {
  const restores: Array<() => void> = [];
  const updates: any[] = [];
  patch(LearningOutcomeEventModel, "findOneAndUpdate", (_filter: any, update: any) => {
    updates.push(update);
    return updates.length === 1
      ? queryResult(event({ eventType: "course.completed", resourceType: "course", competencyIds: [], metadata: {} }))
      : event();
  }, restores);
  try {
    const result = await processLearningOutcome("loe-1");
    assert.equal(result.competencyUpdated, false);
    assert.equal(updates.at(-1).$set.personalizationTrace.scope, "fallback");
    assert.equal(updates.at(-1).$set.personalizationTrace.scopeFallback, true);
    assert.equal(updates.at(-1).$set.personalizationTrace.fallbackReason, "missing_competency_mapping");
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
