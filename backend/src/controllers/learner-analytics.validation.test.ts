import assert from "node:assert/strict";
import test from "node:test";
import * as learnerAnalyticsService from "../services/learner-analytics.service";
import * as platformCourseService from "../services/platform-course-effectiveness.service";
import * as trainingEffectivenessService from "../services/training-effectiveness.service";
import { AnalyticsDateRangeError } from "../services/analytics-foundation.service";
import {
  getLearnerAnalytics,
  getPlatformCourseEffectivenessController,
  getTrainingEffectivenessController
} from "./learner-analytics.controller";

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
}

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this; },
    json(body: unknown) { this.body = body; return this; }
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    user: { id: "authenticated-learner" },
    query: {},
    params: {},
    ...overrides
  } as any;
}

test("learner analytics controller uses authenticated identity and ignores arbitrary userId", async () => {
  const restores: Array<() => void> = [];
  let receivedUserId = "";
  let receivedQuery: any;
  patch(learnerAnalyticsService, "getLearnerPerformanceAnalytics", async (userId: string, query: any) => {
    receivedUserId = userId;
    receivedQuery = query;
    return { summary: { dataSufficiency: { hasData: false } }, records: [] };
  }, restores);
  try {
    const res = response();
    await getLearnerAnalytics(request({ query: { userId: "another-learner", from: "2026-09-01T00:00:00Z" } }), res as any);
    assert.equal(receivedUserId, "authenticated-learner");
    assert.equal(receivedQuery.userId, undefined);
    assert.equal(receivedQuery.from.toISOString(), "2026-09-01T00:00:00.000Z");
    assert.deepEqual(res.body, { summary: { dataSufficiency: { hasData: false } }, records: [] });
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("platform-course effectiveness controller preserves the stable response contract", async () => {
  const restores: Array<() => void> = [];
  let receivedUserId = "";
  let receivedCode = "";
  patch(platformCourseService, "getPlatformCourseEffectiveness", async (userId: string, code: string) => {
    receivedUserId = userId;
    receivedCode = code;
    return {
      course: { code },
      progress: null,
      completion: { completed: false },
      outcome: null,
      lineage: { strength: "unavailable", status: "unavailable", items: [] },
      catalogCompetencyContext: [],
      competencyObservation: { classification: "insufficient_evidence", confidence: "insufficient", items: [], limitations: [] },
      recommendationContext: null,
      interpretation: "NOT_COMPLETED",
      limitations: []
    };
  }, restores);
  try {
    const res = response();
    await getPlatformCourseEffectivenessController(request({ params: { code: "  COURSE-1  " } }), res as any);
    assert.equal(receivedUserId, "authenticated-learner");
    assert.equal(receivedCode, "COURSE-1");
    const body = res.body as any;
    for (const key of ["course", "progress", "completion", "outcome", "lineage", "catalogCompetencyContext", "competencyObservation", "recommendationContext", "interpretation", "limitations"]) {
      assert.equal(Object.prototype.hasOwnProperty.call(body, key), true, `missing ${key}`);
    }
    assert.deepEqual(body.catalogCompetencyContext, []);
    assert.equal(body.recommendationContext, null);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("training effectiveness controller validates source and maps bounded errors without leaking internals", async () => {
  const restores: Array<() => void> = [];
  let received: any;
  patch(trainingEffectivenessService, "getTrainingEffectiveness", async (...args: any[]) => {
    received = args;
    return { source: args[1], resource: { resourceId: args[2] }, outcome: null, limitations: [] };
  }, restores);
  try {
    const res = response();
    await getTrainingEffectivenessController(request({
      params: { source: "igot", resourceId: "course-1" },
      query: { to: "2026-09-08T00:00:00Z" }
    }), res as any);
    assert.equal(received[0], "authenticated-learner");
    assert.equal(received[1], "igot");
    assert.equal(received[2], "course-1");
    assert.equal(received[3].to.toISOString(), "2026-09-08T00:00:00.000Z");

    const invalid = request({ params: { source: "unknown", resourceId: "course-1" } });
    await assert.rejects(() => getTrainingEffectivenessController(invalid, response() as any), /Invalid enum value/);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("training effectiveness maps not-found and invalid-range errors to stable client responses", async () => {
  const restores: Array<() => void> = [];
  patch(trainingEffectivenessService, "getTrainingEffectiveness", async () => {
    throw new trainingEffectivenessService.TrainingEffectivenessResourceNotFoundError();
  }, restores);
  try {
    const notFound = response();
    await getTrainingEffectivenessController(request({ params: { source: "nssta", resourceId: "programme-1" } }), notFound as any);
    assert.equal(notFound.statusCode, 404);
    assert.deepEqual(notFound.body, { message: "Training resource not found.", code: "TRAINING_RESOURCE_NOT_FOUND" });
    patch(trainingEffectivenessService, "getTrainingEffectiveness", async () => {
      throw new AnalyticsDateRangeError("Invalid analytics date range.");
    }, restores);
    const invalidRange = response();
    await getTrainingEffectivenessController(request({ params: { source: "igot", resourceId: "course-1" } }), invalidRange as any);
    assert.equal(invalidRange.statusCode, 400);
    assert.deepEqual(invalidRange.body, { message: "Invalid analytics date range.", code: "INVALID_ANALYTICS_RANGE" });
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
