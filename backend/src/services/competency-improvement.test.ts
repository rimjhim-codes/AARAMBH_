import assert from "node:assert/strict";
import test from "node:test";
import * as lineageService from "./evidence-lineage.service";
import { CompetencyScoreModel, CompetencyModel } from "../models/sih/SihModels";
import { buildCompetencyImprovement, getCompetencyImprovement } from "./competency-improvement.service";
import { createAnalyticsDateRange } from "./analytics-foundation.service";

const range = createAnalyticsDateRange({ from: "2026-01-01T00:00:00Z", to: "2026-09-01T00:00:00Z", now: new Date("2026-09-08T00:00:00Z") });

function score(input: Partial<any> = {}): any {
  return {
    _id: "score-1",
    competencyId: "comp-1",
    frameworkId: "framework-1",
    frameworkVersionId: "version-1",
    frameworkVersion: "1.0",
    proficiencyScale: "internal_0_5",
    history: [
      { date: new Date("2026-02-01T00:00:00Z"), level: 1, source: "assessment" },
      { date: new Date("2026-08-01T00:00:00Z"), level: 3, source: "quiz" }
    ],
    evidence: [],
    ...input
  };
}

function lineage(input: Partial<any> = {}): any {
  return {
    id: "outcome-item",
    source: "learning_outcome",
    sourceId: "outcome-1",
    resourceType: "quiz",
    resourceId: "quiz-1",
    title: "Quiz",
    status: "completed",
    outcomeId: "outcome-1",
    outcomeType: "quiz.completed",
    outcomeTimestamp: new Date("2026-08-01T00:00:00Z"),
    validatedOutcome: true,
    competencyIds: ["comp-1"],
    competencies: [{
      competencyId: "comp-1",
      evidenceReference: "outcome:outcome-1:comp-1",
      evidenceType: "quiz",
      evidenceTimestamp: new Date("2026-08-01T00:00:00Z"),
      historyTimestamp: new Date("2026-08-01T00:00:00Z"),
      strength: "direct"
    }],
    lineageStrength: "direct",
    lineageStatus: "complete",
    ...input
  };
}

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
}

function query<T>(value: T) {
  return {
    select: () => ({ limit: () => ({ lean: async () => value }), lean: async () => value }),
    limit: () => ({ lean: async () => value }),
    lean: async () => value
  };
}

test("two observations produce an improved deterministic 0-5 proficiency delta", () => {
  const result = buildCompetencyImprovement([score()], [{ _id: "comp-1", name: "Python", code: "PY" }], [lineage()], range)[0];
  assert.equal(result.competencyName, "Python");
  assert.equal(result.baseline?.proficiency, 1);
  assert.equal(result.latest?.proficiency, 3);
  assert.equal(result.improvement.proficiencyDelta, 2);
  assert.equal(result.improvement.classification, "improved");
  assert.equal(result.framework.proficiencyScale, "internal_0_5");
});

test("unchanged and declined observations are classified without arbitrary thresholds", () => {
  const unchanged = buildCompetencyImprovement([score({ history: [
    { date: new Date("2026-02-01"), level: 2, source: "assessment" },
    { date: new Date("2026-08-01"), level: 2, source: "quiz" }
  ] })], [], [], range)[0];
  assert.equal(unchanged.improvement.classification, "unchanged");
  assert.equal(unchanged.improvement.proficiencyDelta, 0);
  const declined = buildCompetencyImprovement([score({ history: [
    { date: new Date("2026-02-01"), level: 4, source: "assessment" },
    { date: new Date("2026-08-01"), level: 2, source: "quiz" }
  ] })], [], [], range)[0];
  assert.equal(declined.improvement.classification, "declined");
  assert.equal(declined.improvement.proficiencyDelta, -2);
});

test("one observation and missing history are insufficient, not zero-based improvements", () => {
  const one = buildCompetencyImprovement([score({ history: [{ date: new Date("2026-02-01"), level: 2, source: "assessment" }] })], [], [], range)[0];
  assert.equal(one.improvement.classification, "insufficient_evidence");
  assert.equal(one.improvement.proficiencyDelta, undefined);
  assert.equal(one.confidence, "insufficient");
  const none = buildCompetencyImprovement([score({ history: [] })], [], [], range)[0];
  assert.equal(none.baseline, undefined);
  assert.equal(none.latest, undefined);
  assert.match(none.limitations[0], /No reliable competency history/);
});

test("direct, associated, and unavailable evidence affect summary and confidence", () => {
  const direct = buildCompetencyImprovement([score()], [], [lineage()], range)[0];
  assert.equal(direct.evidenceSummary.directEvidenceCount, 1);
  assert.equal(direct.confidence, "medium");
  const associated = buildCompetencyImprovement([score()], [], [lineage({ competencies: [{ competencyId: "comp-1", evidenceType: "assessment", historyTimestamp: new Date("2026-02-01"), strength: "associated" }] })], range)[0];
  assert.equal(associated.evidenceSummary.associatedEvidenceCount, 1);
  assert.equal(associated.confidence, "low");
  const unavailable = buildCompetencyImprovement([score()], [], [], range)[0];
  assert.equal(unavailable.evidenceSummary.unavailableEvidenceCount, 2);
  assert.equal(unavailable.confidence, "low");
});

test("framework or proficiency-scale mismatch prevents a misleading delta", () => {
  const result = buildCompetencyImprovement([score({ history: [
    { date: new Date("2026-02-01"), level: 1, source: "assessment", frameworkVersion: "1.0", proficiencyScale: "internal_0_5" },
    { date: new Date("2026-08-01"), level: 80, source: "assessment", frameworkVersion: "2.0", proficiencyScale: "percentage" }
  ] })], [], [], range)[0];
  assert.equal(result.improvement.classification, "insufficient_evidence");
  assert.equal(result.improvement.proficiencyDelta, undefined);
  assert.equal(result.framework.compatible, false);
  assert.match(result.limitations.join(" "), /incompatible framework/i);
});

test("course/training completion and personalization context do not become competency evidence", () => {
  const result = buildCompetencyImprovement([score()], [], [lineage({
    source: "platform",
    resourceType: "platform_course",
    outcomeType: "course.completed",
    validatedOutcome: true,
    competencies: [],
    competencyIds: [],
    personalization: { traceReference: "trace-1", affectedCompetencyIds: ["comp-1"], affectedGapIds: [], affectedRecommendationIds: [] }
  })], range)[0];
  assert.equal(result.evidenceSummary.directEvidenceCount, 0);
  assert.equal(result.evidenceSummary.associatedEvidenceCount, 0);
  assert.equal(result.evidenceSummary.validatedOutcomeCount, 0);
  assert.equal(result.confidence, "low");
});

test("duplicate lineage references are counted once and provider source metadata is not synthesized", () => {
  const duplicate = lineage({ metadata: { providerSource: "igot_simulated" }, source: "igot", resourceType: "igot_course", competencies: [{
    competencyId: "comp-1", evidenceReference: "outcome:outcome-1:comp-1", evidenceType: "course", historyTimestamp: new Date("2026-08-01"), strength: "direct"
  }] });
  const result = buildCompetencyImprovement([score()], [], [duplicate, { ...duplicate, id: "duplicate-item" }], range)[0];
  assert.equal(result.evidenceSummary.directEvidenceCount, 1);
  assert.deepEqual(result.evidenceSummary.sources, ["igot"]);
  assert.deepEqual(result.evidenceSummary.providerSources, ["igot_simulated"]);
});

test("service is learner-scoped and bounded without write methods", async () => {
  const restores: Array<() => void> = [];
  let scoreFilter: any;
  let scoreLimit: number | undefined;
  patch(CompetencyScoreModel, "find", (filter: any) => {
    scoreFilter = filter;
    return {
      select: () => ({ limit: (value: number) => { scoreLimit = value; return { lean: async () => [score()] }; } })
    };
  }, restores);
  patch(CompetencyModel, "find", () => query([{ _id: "comp-1", name: "Python" }]), restores);
  patch(lineageService, "getEvidenceLineage", async (userId: string, options: any) => {
    assert.equal(userId, "learner-1");
    assert.equal(options.limit, 250);
    return { dateRange: range, items: [lineage()] };
  }, restores);
  try {
    const result = await getCompetencyImprovement("learner-1", { ...range, limit: 999 });
    assert.equal(scoreFilter.userId, "learner-1");
    assert.equal(scoreLimit, 250);
    assert.equal(result.items[0].competencyId, "comp-1");
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("repeated execution is deterministic", () => {
  const first = buildCompetencyImprovement([score()], [], [lineage()], range)[0];
  const second = buildCompetencyImprovement([score()], [], [lineage()], range)[0];
  assert.deepEqual(first, second);
});
