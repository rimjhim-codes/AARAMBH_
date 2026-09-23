import assert from "node:assert/strict";
import test from "node:test";
import {
  enrollIgotLocal,
  enrollNsstaLocal,
  normalizePlatformCourseNavigation,
  updateIgotProgress,
  updateNsstaProgress
} from "./recommendation.controller";
import * as models from "../../models/sih/SihModels";
import * as igotModule from "../../services/integrations/igot.provider";
import * as nsstaModule from "../../services/integrations/nssta.provider";
import * as performanceModule from "../../services/performance.service";
import * as auditModule from "../../services/audit-log.service";
import * as recommendationModule from "../../services/recommendation.service";
import { IntegrationProviderError } from "../../services/integrations/types";
import { IntegrationResponseValidationError } from "../../services/integrations/http";

type AnyFunction = (...args: any[]) => any;

function patch(target: object, key: string, value: AnyFunction): () => void {
  const original = (target as any)[key];
  (target as any)[key] = value;
  return () => { (target as any)[key] = original; };
}

function response() {
  return {
    statusCode: 200,
    body: undefined as any,
    status(code: number) { this.statusCode = code; return this; },
    json(body: any) { this.body = body; return this; }
  };
}

function request(body: Record<string, any>) {
  return { user: { id: "user-1" }, body } as any;
}

function liveProvider(enrollCourse: AnyFunction, syncEnrollment: AnyFunction = async (input: any) => input) {
  return {
    getStatus: async () => ({ status: "simulated" as const, mode: "simulated" as const, message: "test" }),
    enrollCourse,
    syncEnrollment,
    searchCourses: async () => [],
    name: "test"
  } as any;
}

function commonCleanup() {
  const restores: Array<() => void> = [];
  restores.push(patch(performanceModule, "recalculatePerformance", async () => undefined));
  restores.push(patch(auditModule, "writeAuditLog", async () => undefined));
  return restores;
}

test("platform navigation normalizes legacy recommendation identity to the catalog code", async () => {
  const restores = [patch(models.PlatformCourseModel, "find", () => ({
    select() { return this; },
    lean: async () => [{ _id: "507f1f77bcf86cd799439011", code: "DEMO_PYTHON_DATA_ANALYSIS" }]
  }))];
  try {
    const result = await normalizePlatformCourseNavigation([{
      _id: "recommendation-1",
      source: "platform",
      externalId: "507f1f77bcf86cd799439011",
      courseUrl: "/platform-courses/507f1f77bcf86cd799439011"
    }]);
    assert.equal(result[0].externalId, "DEMO_PYTHON_DATA_ANALYSIS");
    assert.equal(result[0].courseUrl, "/platform-courses/DEMO_PYTHON_DATA_ANALYSIS");
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("invalid platform recommendation does not receive a fake courseUrl", async () => {
  const restores = [patch(models.PlatformCourseModel, "find", () => ({
    select() { return this; },
    lean: async () => []
  }))];
  try {
    const result = await normalizePlatformCourseNavigation([{
      _id: "recommendation-2",
      source: "platform",
      externalId: "PATH_STAT_AGRI_FOUNDATION",
      courseUrl: "/platform-courses/PATH_STAT_AGRI_FOUNDATION",
      title: "Foundation track"
    }]);
    assert.equal(result[0].externalId, "PATH_STAT_AGRI_FOUNDATION");
    assert.equal(result[0].courseUrl, "");
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("iGOT first enrollment persists provider state and synchronizes recommendation", async () => {
  const restores = commonCleanup();
  let providerCalls = 0;
  let persisted: any;
  let recommendationFilter: any;
  restores.push(patch(models.IGOTEnrollmentModel, "findOne", async () => null));
  restores.push(patch(models.IGOTEnrollmentModel, "findOneAndUpdate", async (_filter: any, update: any) => {
    persisted = update;
    return { ...update };
  }));
  restores.push(patch(models.LearningRecommendationModel, "updateOne", async (filter: any) => {
    recommendationFilter = filter;
    return { modifiedCount: 1 };
  }));
  restores.push(patch(igotModule, "getIgotProvider", () => liveProvider(async () => {
    providerCalls += 1;
    return { id: "remote-1", courseId: "course-1", status: "enrolled", progressPercent: 0 };
  })));

  try {
    const res = response();
    await enrollIgotLocal(request({ courseId: "course-1", title: "SQL" }), res as any);
    assert.equal(providerCalls, 1);
    assert.equal(persisted.externalEnrollmentId, "remote-1");
    assert.equal(persisted.status, "enrolled");
    assert.equal(persisted.progressPercent, 0);
    assert.deepEqual(recommendationFilter, {
      userId: "user-1", source: "igot", externalId: "course-1", status: "recommended"
    });
    assert.equal(res.statusCode, 201);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("iGOT repeat enrollment preserves existing state and skips provider", async () => {
  const restores = commonCleanup();
  let providerCalls = 0;
  let localWrites = 0;
  let recommendationUpdates = 0;
  const existing = {
    userId: "user-1", courseId: "course-1", status: "in_progress", progressPercent: 42,
    externalEnrollmentId: "remote-existing", source: "igot_simulated", syncError: ""
  };
  restores.push(patch(models.IGOTEnrollmentModel, "findOne", async () => existing));
  restores.push(patch(models.IGOTEnrollmentModel, "findOneAndUpdate", async () => { localWrites += 1; return existing; }));
  restores.push(patch(models.LearningRecommendationModel, "updateOne", async () => { recommendationUpdates += 1; return {}; }));
  restores.push(patch(igotModule, "getIgotProvider", () => liveProvider(async () => { providerCalls += 1; throw new Error("must not call"); })));
  try {
    const res = response();
    await enrollIgotLocal(request({ courseId: "course-1", title: "SQL" }), res as any);
    assert.equal(providerCalls, 0);
    assert.equal(localWrites, 0);
    assert.equal(recommendationUpdates, 1);
    assert.equal(existing.progressPercent, 42);
    assert.equal(existing.status, "in_progress");
    assert.equal(existing.externalEnrollmentId, "remote-existing");
    assert.equal(res.body.enrollment, existing);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("iGOT completed enrollment remains completed with progress and identity intact", async () => {
  const restores = commonCleanup();
  const existing = {
    userId: "user-1", courseId: "course-1", status: "completed", progressPercent: 100,
    externalEnrollmentId: "remote-complete", source: "igot_live", completedAt: new Date()
  };
  restores.push(patch(models.IGOTEnrollmentModel, "findOne", async () => existing));
  restores.push(patch(models.LearningRecommendationModel, "updateOne", async () => ({})));
  restores.push(patch(igotModule, "getIgotProvider", () => liveProvider(async () => { throw new Error("must not call"); })));
  try {
    await enrollIgotLocal(request({ courseId: "course-1", title: "SQL" }), response() as any);
    assert.equal(existing.status, "completed");
    assert.equal(existing.progressPercent, 100);
    assert.equal(existing.externalEnrollmentId, "remote-complete");
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("iGOT provider failure returns safe 502 without local persistence", async () => {
  const restores = commonCleanup();
  let localWrites = 0;
  restores.push(patch(models.IGOTEnrollmentModel, "findOne", async () => null));
  restores.push(patch(models.IGOTEnrollmentModel, "findOneAndUpdate", async () => { localWrites += 1; return {}; }));
  restores.push(patch(igotModule, "getIgotProvider", () => liveProvider(async () => {
    throw new IntegrationProviderError("provider body contains secret", "igot", "rate_limited", 429, true, 100);
  })));
  try {
    const res = response();
    await enrollIgotLocal(request({ courseId: "course-1", title: "SQL" }), res as any);
    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.body, { message: "iGOT provider request failed.", code: "rate_limited", retryable: true });
    assert.equal(localWrites, 0);
    assert.equal(JSON.stringify(res.body).includes("secret"), false);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("NSSTA first enrollment persists provider state and synchronizes recommendation", async () => {
  const restores = commonCleanup();
  let providerCalls = 0;
  let persisted: any;
  let recommendationFilter: any;
  restores.push(patch(models.NSSTAEnrollmentModel, "findOne", async () => null));
  restores.push(patch(models.NSSTAEnrollmentModel, "findOneAndUpdate", async (_filter: any, update: any) => { persisted = update; return { ...update }; }));
  restores.push(patch(models.LearningRecommendationModel, "updateOne", async (filter: any) => { recommendationFilter = filter; return {}; }));
  restores.push(patch(nsstaModule, "getNsstaProvider", () => liveProvider(async (input: any) => {
    providerCalls += 1;
    assert.equal(input.courseId, "programme-1");
    return { id: "remote-programme-1", courseId: "programme-1", status: "enrolled", progressPercent: 0 };
  })));
  try {
    const res = response();
    await enrollNsstaLocal(request({ programmeId: "programme-1", title: "TPAC" }), res as any);
    assert.equal(providerCalls, 1);
    assert.equal(persisted.externalEnrollmentId, "remote-programme-1");
    assert.equal(persisted.status, "enrolled");
    assert.deepEqual(recommendationFilter, {
      userId: "user-1", source: "nssta", externalId: "programme-1", status: "recommended"
    });
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("NSSTA repeat and completed enrollments preserve local state and skip provider", async () => {
  const restores = commonCleanup();
  const existing = {
    userId: "user-1", programmeId: "programme-1", status: "completed", progressPercent: 100,
    externalEnrollmentId: "remote-programme", source: "nssta_live", completedAt: new Date()
  };
  let providerCalls = 0;
  restores.push(patch(models.NSSTAEnrollmentModel, "findOne", async () => existing));
  restores.push(patch(models.LearningRecommendationModel, "updateOne", async () => ({})));
  restores.push(patch(nsstaModule, "getNsstaProvider", () => liveProvider(async () => { providerCalls += 1; throw new Error("must not call"); })));
  try {
    await enrollNsstaLocal(request({ programmeId: "programme-1", title: "TPAC" }), response() as any);
    assert.equal(providerCalls, 0);
    assert.equal(existing.status, "completed");
    assert.equal(existing.progressPercent, 100);
    assert.equal(existing.externalEnrollmentId, "remote-programme");
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("NSSTA provider failure returns safe 502 without local persistence", async () => {
  const restores = commonCleanup();
  let localWrites = 0;
  restores.push(patch(models.NSSTAEnrollmentModel, "findOne", async () => null));
  restores.push(patch(models.NSSTAEnrollmentModel, "findOneAndUpdate", async () => { localWrites += 1; return {}; }));
  restores.push(patch(nsstaModule, "getNsstaProvider", () => liveProvider(async () => {
    throw new IntegrationProviderError("raw credentials should not escape", "nssta", "timeout", undefined, true);
  })));
  try {
    const res = response();
    await enrollNsstaLocal(request({ programmeId: "programme-1", title: "TPAC" }), res as any);
    assert.equal(res.statusCode, 502);
    assert.deepEqual(res.body, { message: "NSSTA provider request failed.", code: "timeout", retryable: true });
    assert.equal(localWrites, 0);
    assert.equal(JSON.stringify(res.body).includes("credentials"), false);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("controller sanitizes timeout, network, HTTP, and invalid-response failures", async () => {
  const cases = [
    { error: new IntegrationProviderError("timeout details", "igot", "timeout", undefined, true), code: "timeout", retryable: true },
    { error: new IntegrationProviderError("network details", "igot", "network_error", undefined, true), code: "network_error", retryable: true },
    { error: new IntegrationProviderError("provider body and token", "igot", "http_error", 500, true), code: "http_error", retryable: true },
    { error: new IntegrationResponseValidationError("iGOT"), code: "invalid_provider_response", retryable: false }
  ];
  for (const current of cases) {
    const restores = commonCleanup();
    restores.push(patch(models.IGOTEnrollmentModel, "findOne", async () => null));
    restores.push(patch(igotModule, "getIgotProvider", () => liveProvider(async () => { throw current.error; })));
    try {
      const res = response();
      await enrollIgotLocal(request({ courseId: "course-1", title: "SQL" }), res as any);
      assert.equal(res.statusCode, 502);
      assert.deepEqual(res.body, {
        message: current.code === "invalid_provider_response" ? "iGOT provider returned an invalid response." : "iGOT provider request failed.",
        code: current.code,
        retryable: current.retryable
      });
      assert.equal(JSON.stringify(res.body).includes("details"), false);
      assert.equal(JSON.stringify(res.body).includes("token"), false);
    } finally { restores.reverse().forEach((restore) => restore()); }
  }
});

test("NSSTA in-progress enrollment preserves progress and skips provider", async () => {
  const restores = commonCleanup();
  let providerCalls = 0;
  const existing = {
    userId: "user-1", programmeId: "programme-1", status: "in_progress", progressPercent: 67,
    externalEnrollmentId: "remote-progress", source: "nssta_simulated", syncError: ""
  };
  restores.push(patch(models.NSSTAEnrollmentModel, "findOne", async () => existing));
  restores.push(patch(models.LearningRecommendationModel, "updateOne", async () => ({})));
  restores.push(patch(nsstaModule, "getNsstaProvider", () => liveProvider(async () => { providerCalls += 1; throw new Error("must not call"); })));
  try {
    await enrollNsstaLocal(request({ programmeId: "programme-1", title: "TPAC" }), response() as any);
    assert.equal(providerCalls, 0);
    assert.equal(existing.status, "in_progress");
    assert.equal(existing.progressPercent, 67);
    assert.equal(existing.externalEnrollmentId, "remote-progress");
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("iGOT completion progress invokes training synchronization without resetting state", async () => {
  const restores = commonCleanup();
  let syncInput: any;
  const enrollment: any = {
    userId: "user-1", courseId: "course-1", status: "enrolled", progressPercent: 0,
    source: "igot_simulated", externalEnrollmentId: "remote-1", save: async () => undefined
  };
  restores.push(patch(models.IGOTEnrollmentModel, "findOne", async () => enrollment));
  restores.push(patch(igotModule, "getIgotProvider", () => liveProvider(async (input: any) => ({ ...input, id: "remote-1" }))));
  restores.push(patch(recommendationModule, "syncTrainingCompletion", async (input: any) => { syncInput = input; return {}; }));
  try {
    await updateIgotProgress({ ...request({ progressPercent: 100 }), params: { courseId: "course-1" } } as any, response() as any);
    assert.equal(enrollment.status, "completed");
    assert.equal(enrollment.progressPercent, 100);
    assert.deepEqual(syncInput, { userId: "user-1", source: "igot", externalId: "course-1", completed: true });
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("NSSTA completion progress invokes training synchronization without resetting state", async () => {
  const restores = commonCleanup();
  let syncInput: any;
  const enrollment: any = {
    userId: "user-1", programmeId: "programme-1", status: "in_progress", progressPercent: 35,
    source: "nssta_simulated", externalEnrollmentId: "remote-programme", save: async () => undefined
  };
  restores.push(patch(models.NSSTAEnrollmentModel, "findOne", async () => enrollment));
  restores.push(patch(nsstaModule, "getNsstaProvider", () => liveProvider(async (input: any) => ({ ...input, id: "remote-programme" }))));
  restores.push(patch(recommendationModule, "syncTrainingCompletion", async (input: any) => { syncInput = input; return {}; }));
  try {
    await updateNsstaProgress({ ...request({ progressPercent: 100 }), params: { programmeId: "programme-1" } } as any, response() as any);
    assert.equal(enrollment.status, "completed");
    assert.equal(enrollment.progressPercent, 100);
    assert.deepEqual(syncInput, { userId: "user-1", source: "nssta", externalId: "programme-1", completed: true });
  } finally { restores.reverse().forEach((restore) => restore()); }
});
