import assert from "node:assert/strict";
import test from "node:test";
import * as historyService from "./learning-history.service";
import * as performanceService from "./performance.service";
import {
  AnalyticsAuthorizationError,
  AnalyticsDateRangeError,
  createAnalyticsDateRange,
  getLearnerAnalyticsFoundation,
  normalizeAnalyticsRecord,
  normalizeAnalyticsSource,
  normalizeAnalyticsStatus,
  resolveAnalyticsUserScope
} from "./analytics-foundation.service";

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
}

test("analytics date ranges default to 90 days and normalize explicit dates", () => {
  const now = new Date("2026-09-08T00:00:00.000Z");
  const defaultRange = createAnalyticsDateRange({ now });
  assert.equal(defaultRange.days, 90);
  assert.equal(defaultRange.to.toISOString(), now.toISOString());
  const explicit = createAnalyticsDateRange({ from: "2026-01-01T00:00:00Z", to: "2026-02-01T00:00:00Z", now });
  assert.equal(explicit.days, 31);
});

test("analytics date ranges reject invalid, reversed, future, and oversized ranges", () => {
  const now = new Date("2026-09-08T00:00:00.000Z");
  assert.throws(() => createAnalyticsDateRange({ from: "not-a-date", now }), AnalyticsDateRangeError);
  assert.throws(() => createAnalyticsDateRange({ from: "2026-02-01", to: "2026-01-01", now }), AnalyticsDateRangeError);
  assert.throws(() => createAnalyticsDateRange({ to: "2026-09-09", now }), AnalyticsDateRangeError);
  assert.throws(() => createAnalyticsDateRange({ from: "2024-01-01", to: "2026-01-01", now }), AnalyticsDateRangeError);
});

test("analytics source and status normalization reuses history semantics", () => {
  assert.equal(normalizeAnalyticsSource("formal_assessment"), "assessment");
  assert.equal(normalizeAnalyticsSource("nssta_course"), "nssta");
  assert.equal(normalizeAnalyticsSource("igot_course"), "igot");
  assert.equal(normalizeAnalyticsSource("virtual_lab"), "virtual_lab");
  assert.equal(normalizeAnalyticsStatus("started"), "in_progress");
  assert.equal(normalizeAnalyticsStatus("complete"), "completed");
  assert.equal(normalizeAnalyticsStatus("failed"), "failed");
  assert.equal(normalizeAnalyticsStatus("submitted", true), "passed");
});

test("analytics scope prevents learner cross-user access while allowing explicit admin scope", () => {
  assert.equal(resolveAnalyticsUserScope({ authenticatedUserId: "learner-1" }), "learner-1");
  assert.throws(() => resolveAnalyticsUserScope({ authenticatedUserId: "learner-1", requestedUserId: "learner-2", roles: ["employee"] }), AnalyticsAuthorizationError);
  assert.equal(resolveAnalyticsUserScope({ authenticatedUserId: "admin-1", requestedUserId: "learner-2", roles: ["admin"] }), "learner-2");
});

test("analytics normalization preserves outcome traceability without raw metadata", () => {
  const item = normalizeAnalyticsRecord({
    id: "outcome:loe-1",
    source: "learning_outcome",
    sourceId: "loe-1",
    resourceId: "lab-1",
    resourceType: "lab",
    eventType: "lab.completed",
    title: "Lab",
    status: "completed",
    sourceStatus: "processed",
    occurredAt: new Date("2026-09-01T00:00:00Z"),
    score: 88,
    competencyImpact: [{ competencyId: "competency-1", evidenceReference: "outcome:loe-1:competency-1" }],
    evidenceReference: "loe-1",
    personalization: { traceReference: "loe-1", adaptiveAction: "progress" },
    metadata: { title: "Lab", feedback: "Good work" }
  });
  assert.equal(item.validatedOutcome, true);
  assert.deepEqual(item.competencyIds, ["competency-1"]);
  assert.equal(item.evidenceReference, "loe-1");
  assert.equal(item.traceReference, "loe-1");
  assert.equal((item.metadata as any)?.code, undefined);
});

test("foundation uses bounded history and stored performance reads without writes", async () => {
  const restores: Array<() => void> = [];
  let historyQuery: any;
  let performanceReads = 0;
  patch(historyService, "getUnifiedLearningHistory", async (_userId: string, query: any) => {
    historyQuery = query;
    return { items: [], pagination: { page: 1, limit: query.limit, total: 0, hasMore: false } };
  }, restores);
  patch(performanceService, "getStoredPerformance", async () => { performanceReads += 1; return { userId: "learner-1" }; }, restores);
  try {
    const result = await getLearnerAnalyticsFoundation("learner-1", { now: new Date("2026-09-08T00:00:00Z"), limit: 999 });
    assert.equal(result.records.length, 0);
    assert.equal(historyQuery.limit, 250);
    assert.ok(historyQuery.from instanceof Date);
    assert.ok(historyQuery.to instanceof Date);
    assert.equal(performanceReads, 1);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
