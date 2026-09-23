import assert from "node:assert/strict";
import test from "node:test";
import * as historyService from "./learning-history.service";
import { CompetencyScoreModel } from "../models/sih/SihModels";
import { LearningOutcomeEventModel } from "../models/LearningOutcomeEvent";
import { buildEvidenceLineage, getEvidenceLineage } from "./evidence-lineage.service";

function history(input: Partial<any>): any {
  return {
    id: "item-1",
    source: "quiz",
    sourceId: "attempt-1",
    resourceType: "quiz",
    resourceId: "quiz-1",
    title: "Quiz",
    status: "completed",
    occurredAt: new Date("2026-08-20T00:00:00Z"),
    competencyImpact: [],
    ...input
  };
}

function outcome(input: Partial<any>) {
  return {
    eventId: "outcome-1",
    userId: "learner-1",
    eventType: "quiz.completed",
    resourceType: "quiz",
    resourceId: "quiz-1",
    source: "arambh",
    occurredAt: new Date("2026-08-20T00:00:00Z"),
    status: "processed",
    competencyIds: ["comp-1"],
    ...input
  };
}

function score(input: Partial<any>) {
  return {
    _id: "score-1",
    competencyId: "comp-1",
    frameworkId: "framework-1",
    frameworkVersionId: "version-1",
    frameworkVersion: "1.0",
    proficiencyScale: "internal_0_5",
    evidence: [{ type: "quiz", key: "outcome:outcome-1:comp-1", scoreImpact: 1, at: new Date("2026-08-20T00:00:00Z") }],
    history: [{ date: new Date("2026-08-20T00:00:00Z"), level: 2, source: "quiz" }],
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
    select: () => ({ lean: async () => value }),
    sort: () => ({ limit: () => ({ lean: async () => value }) }),
    limit: () => ({ lean: async () => value }),
    lean: async () => value
  };
}

test("quiz and lab outcomes have direct evidence lineage", () => {
  const quiz = buildEvidenceLineage([history({})], [outcome({})], [score({})])[0];
  assert.equal(quiz.lineageStrength, "direct");
  assert.equal(quiz.lineageStatus, "complete");
  assert.equal(quiz.outcomeId, "outcome-1");
  assert.equal(quiz.competencies[0].evidenceReference, "outcome:outcome-1:comp-1");
  assert.equal(quiz.competencies[0].frameworkVersion, "1.0");

  const lab = buildEvidenceLineage(
    [history({ source: "virtual_lab", sourceId: "attempt-2", resourceType: "virtual_lab", resourceId: "lab-1" })],
    [outcome({ eventId: "lab-outcome", eventType: "lab.completed", resourceType: "lab", resourceId: "lab-1" })],
    [score({ evidence: [{ type: "lab", key: "outcome:lab-outcome:comp-1" }] })]
  )[0];
  assert.equal(lab.lineageStrength, "direct");
});

test("assessment lineage is associated when history exists without a direct evidence key", () => {
  const item = buildEvidenceLineage(
    [history({ source: "assessment", sourceId: "assessment-1", resourceType: "assessment", resourceId: "assessment-1" })],
    [outcome({ eventId: "assessment-outcome", eventType: "assessment.completed", resourceType: "assessment", resourceId: "assessment-1", competencyIds: ["comp-1"] })],
    [score({ evidence: [{ type: "assessment", detail: "Assessment result", at: new Date("2026-08-20T00:00:00Z") }], history: [{ date: new Date("2026-08-20T00:00:00Z"), level: 2, source: "assessment" }] })]
  )[0];
  assert.equal(item.lineageStrength, "associated");
  assert.equal(item.competencies[0].evidenceReference, undefined);
  assert.equal(item.competencies[0].frameworkId, "framework-1");
});

test("course completion without competency mapping is unavailable, not evidence", () => {
  const item = buildEvidenceLineage(
    [history({ source: "platform", sourceId: "progress-1", resourceType: "platform_course", resourceId: "course-1", status: "completed" })],
    [outcome({ eventId: "course-outcome", eventType: "course.completed", resourceType: "course", resourceId: "course-1", competencyIds: [] })],
    []
  )[0];
  assert.equal(item.validatedOutcome, true);
  assert.equal(item.lineageStrength, "unavailable");
  assert.match(item.limitation || "", /no competency mapping/i);
  assert.equal(item.competencyIds.length, 0);
});

test("missing outcome and missing evidence remain explicit", () => {
  const missingOutcome = buildEvidenceLineage([history({})], [], [score({})])[0];
  assert.equal(missingOutcome.lineageStrength, "unavailable");
  assert.match(missingOutcome.limitation || "", /canonical learning outcome/i);

  const missingEvidence = buildEvidenceLineage([history({})], [outcome({})], [score({ evidence: [] })])[0];
  assert.equal(missingEvidence.lineageStrength, "associated");
  assert.equal(missingEvidence.competencies[0].evidenceReference, undefined);
});

test("source and personalization context are preserved without exposing raw submissions", () => {
  const item = buildEvidenceLineage(
    [history({ source: "igot", sourceId: "igot-record", resourceType: "igot_course", resourceId: "igot-1", metadata: { providerSource: "igot_simulated", code: "must-not-leak" } })],
    [outcome({ eventType: "course.completed", resourceType: "course", resourceId: "igot-1", source: "igot", competencyIds: [], personalizationTrace: { traceReference: "trace-1", scope: "fallback", scopeFallback: true, gapIds: ["gap-1"], recommendationIds: ["rec-1"], adaptive: { decision: "review" } } })],
    []
  )[0];
  assert.equal(item.source, "igot");
  assert.equal(item.personalization?.traceReference, "trace-1");
  assert.deepEqual(item.personalization?.affectedGapIds, ["gap-1"]);
  assert.equal((item.metadata as any)?.code, undefined);
  assert.equal((item as any).rawCode, undefined);
});

test("lineage query is learner-scoped, bounded, and read-only", async () => {
  const restores: Array<() => void> = [];
  let outcomeFilter: any;
  let scoreFilter: any;
  patch(historyService, "getUnifiedLearningHistory", async (userId: string, options: any) => {
    assert.equal(userId, "learner-1");
    assert.ok(options.from instanceof Date);
    assert.ok(options.to instanceof Date);
    assert.equal(options.limit, 250);
    return { items: [history({})], pagination: { page: 1, limit: 250, total: 1, hasMore: false } };
  }, restores);
  patch(LearningOutcomeEventModel, "find", (filter: any) => {
    outcomeFilter = filter;
    return query([outcome({})]);
  }, restores);
  patch(CompetencyScoreModel, "find", (filter: any) => {
    scoreFilter = filter;
    return query([score({})]);
  }, restores);
  try {
    const result = await getEvidenceLineage("learner-1", { now: new Date("2026-09-08T00:00:00Z"), limit: 999 });
    assert.equal(result.items[0].lineageStrength, "direct");
    assert.equal(outcomeFilter.userId, "learner-1");
    assert.equal(scoreFilter.userId, "learner-1");
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
