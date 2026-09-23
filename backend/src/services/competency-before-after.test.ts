import assert from "node:assert/strict";
import test from "node:test";
import * as lineageService from "./evidence-lineage.service";
import { CompetencyModel, CompetencyScoreModel } from "../models/sih/SihModels";
import { createAnalyticsDateRange } from "./analytics-foundation.service";
import { buildCompetencyBeforeAfter, getCompetencyBeforeAfter } from "./competency-before-after.service";

const range = createAnalyticsDateRange({
  from: "2026-08-01T00:00:00Z",
  to: "2026-09-01T00:00:00Z",
  now: new Date("2026-09-08T00:00:00Z")
});

function score(history: any[], input: Partial<any> = {}): any {
  return {
    _id: "score-1",
    competencyId: "comp-1",
    frameworkId: "framework-1",
    frameworkVersionId: "version-1",
    frameworkVersion: "1.0",
    proficiencyScale: "internal_0_5",
    history,
    evidence: [],
    ...input
  };
}

function item(input: Partial<any> = {}): any {
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
    outcomeSource: "arambh",
    outcomeTimestamp: new Date("2026-08-25T00:00:00Z"),
    validatedOutcome: true,
    competencyIds: ["comp-1"],
    competencies: [{
      competencyId: "comp-1",
      evidenceReference: "outcome:outcome-1:comp-1",
      evidenceType: "quiz",
      evidenceTimestamp: new Date("2026-08-25T00:00:00Z"),
      historyTimestamp: new Date("2026-08-25T00:00:00Z"),
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

test("selects latest-before and earliest-after around a persisted quiz anchor", () => {
  const result = buildCompetencyBeforeAfter([
    score([
      { date: new Date("2026-08-10"), level: 2, source: "assessment" },
      { date: new Date("2026-08-18"), level: 2, source: "quiz" },
      { date: new Date("2026-08-28"), level: 3, source: "quiz" },
      { date: new Date("2026-09-02"), level: 4, source: "quiz" }
    ])
  ], [{ _id: "comp-1", name: "Python", code: "PY" }], [
    item({ id: "anchor", outcomeId: "anchor-outcome" }),
    item({ id: "before", outcomeId: "before-outcome", outcomeType: "assessment.completed", outcomeTimestamp: new Date("2026-08-18"), competencies: [{ competencyId: "comp-1", evidenceReference: "before-key", evidenceType: "assessment", historyTimestamp: new Date("2026-08-18"), strength: "associated" }] }),
    item({ id: "after", outcomeId: "after-outcome", outcomeType: "quiz.completed", outcomeTimestamp: new Date("2026-08-28"), competencies: [{ competencyId: "comp-1", evidenceReference: "after-key", evidenceType: "quiz", historyTimestamp: new Date("2026-08-28"), strength: "direct" }] })
  ], range);
  const resultItem = result.items.find((entry) => entry.learningAnchor.outcomeId === "anchor-outcome")!;
  assert.equal(result.anchors.length, 3);
  assert.equal(resultItem.learningAnchor.outcomeId, "anchor-outcome");
  assert.equal(resultItem.before?.observedAt.toISOString(), "2026-08-18T00:00:00.000Z");
  assert.equal(resultItem.after?.observedAt.toISOString(), "2026-08-28T00:00:00.000Z");
  assert.equal(resultItem.observedChange.proficiencyDelta, 1);
  assert.equal(resultItem.observedChange.classification, "improved");
});

test("unchanged and declined before/after observations reuse the canonical comparison", () => {
  const unchanged = buildCompetencyBeforeAfter([score([
    { date: new Date("2026-08-10"), level: 2, source: "assessment" },
    { date: new Date("2026-08-28"), level: 2, source: "quiz" }
  ])], [], [item()], range).items[0];
  assert.equal(unchanged.observedChange.classification, "unchanged");
  assert.equal(unchanged.observedChange.proficiencyDelta, 0);
  const declined = buildCompetencyBeforeAfter([score([
    { date: new Date("2026-08-10"), level: 4, source: "assessment" },
    { date: new Date("2026-08-28"), level: 2, source: "quiz" }
  ])], [], [item()], range).items[0];
  assert.equal(declined.observedChange.classification, "declined");
  assert.equal(declined.observedChange.proficiencyDelta, -2);
});

test("missing before or after observations returns insufficient evidence", () => {
  const missingBefore = buildCompetencyBeforeAfter([score([
    { date: new Date("2026-08-28"), level: 3, source: "quiz" }
  ])], [], [item()], range).items[0];
  assert.equal(missingBefore.before, undefined);
  assert.equal(missingBefore.observedChange.classification, "insufficient_evidence");
  const missingAfter = buildCompetencyBeforeAfter([score([
    { date: new Date("2026-08-10"), level: 2, source: "assessment" }
  ])], [], [item()], range).items[0];
  assert.equal(missingAfter.after, undefined);
  assert.equal(missingAfter.observedChange.classification, "insufficient_evidence");
});

test("does not use a baseline outside the bounded analytics range", () => {
  const result = buildCompetencyBeforeAfter([score([
    { date: new Date("2026-07-01"), level: 1, source: "assessment" },
    { date: new Date("2026-08-28"), level: 3, source: "quiz" }
  ])], [], [item()], range).items[0];
  assert.equal(result.before, undefined);
  assert.equal(result.observedChange.classification, "insufficient_evidence");
  assert.match(result.limitations.join(" "), /outside the bounded analysis range/i);
});

test("preserves an existing source event identity without inventing a cycle ID", () => {
  const result = buildCompetencyBeforeAfter([score([
    { date: new Date("2026-08-10"), level: 2, source: "assessment" },
    { date: new Date("2026-08-28"), level: 3, source: "quiz" }
  ])], [], [item({ sourceEventId: "provider-attempt-7" })], range).items[0];
  assert.equal(result.learningAnchor.sourceEventId, "provider-attempt-7");
  assert.equal(result.learningAnchor.outcomeId, "outcome-1");
});

test("no validated learning anchor is explicit and progress is not treated as an anchor", () => {
  const result = buildCompetencyBeforeAfter([score([
    { date: new Date("2026-08-10"), level: 2, source: "assessment" },
    { date: new Date("2026-08-28"), level: 3, source: "quiz" }
  ])], [], [{
    ...item(),
    outcomeId: undefined,
    outcomeType: "learning.progressed",
    validatedOutcome: false
  }], range);
  assert.equal(result.anchors.length, 0);
  assert.equal(result.items.length, 0);
  assert.match(result.limitations[0], /No validated learning outcome/);
});

test("direct quiz and lab evidence remain direct while assessment evidence remains associated", () => {
  const quiz = item({ resourceType: "quiz", outcomeType: "quiz.completed", competencies: [{ competencyId: "comp-1", evidenceReference: "quiz-key", evidenceType: "quiz", historyTimestamp: new Date("2026-08-28"), strength: "direct" }] });
  const lab = item({ id: "lab", resourceType: "lab", resourceId: "lab-1", outcomeId: "lab-outcome", outcomeType: "lab.completed", competencies: [{ competencyId: "comp-1", evidenceReference: "lab-key", evidenceType: "lab", historyTimestamp: new Date("2026-08-28"), strength: "direct" }] });
  const assessment = item({ id: "assessment", resourceType: "assessment", resourceId: "assessment-1", outcomeId: "assessment-outcome", outcomeType: "assessment.completed", outcomeTimestamp: new Date("2026-08-10"), competencies: [{ competencyId: "comp-1", evidenceType: "assessment", historyTimestamp: new Date("2026-08-10"), strength: "associated" }] });
  const result = buildCompetencyBeforeAfter([score([
    { date: new Date("2026-08-10"), level: 2, source: "assessment" },
    { date: new Date("2026-08-28"), level: 3, source: "lab" }
  ])], [], [quiz, lab, assessment], range);
  const quizResult = result.items.find((entry) => entry.learningAnchor.outcomeId === "outcome-1")!;
  assert.equal(quizResult.lineage.overall, "direct");
  assert.ok(quizResult.evidence.learningPeriod.some((reference) => reference.evidenceType === "lab"));
  assert.ok(quizResult.evidence.before.some((reference) => reference.lineageStrength === "associated"));
});

test("course and training completion without competency mapping do not create improvement items", () => {
  const course = item({ resourceType: "course", outcomeType: "course.completed", outcomeId: "course-outcome", competencyIds: [], competencies: [], lineageStrength: "unavailable" });
  const training = item({ id: "training", resourceType: "training", outcomeType: "training.completed", outcomeId: "training-outcome", competencyIds: [], competencies: [], lineageStrength: "unavailable" });
  const result = buildCompetencyBeforeAfter([score([
    { date: new Date("2026-08-10"), level: 2, source: "assessment" },
    { date: new Date("2026-08-28"), level: 3, source: "quiz" }
  ])], [], [course, training], range);
  assert.equal(result.items.length, 0);
  assert.equal(result.anchors.length, 2);
  assert.equal(result.limitations.length, 2);
});

test("iGOT and NSSTA simulated source metadata remains visible on anchors", () => {
  const igot = item({ id: "igot", outcomeId: "igot-outcome", outcomeType: "course.completed", outcomeSource: "igot", resourceType: "course", metadata: { providerSource: "igot_simulated" } });
  const nssta = item({ id: "nssta", outcomeId: "nssta-outcome", outcomeType: "training.completed", outcomeSource: "nssta", resourceType: "training", metadata: { providerSource: "nssta_simulated" } });
  const result = buildCompetencyBeforeAfter([], [], [igot, nssta], range);
  assert.deepEqual(result.anchors.map((anchor) => anchor.providerSource), ["igot_simulated", "nssta_simulated"]);
  assert.deepEqual(result.anchors.map((anchor) => anchor.outcomeSource), ["igot", "nssta"]);
});

test("framework and proficiency-scale mismatch prevents a misleading temporal delta", () => {
  const result = buildCompetencyBeforeAfter([score([
    { date: new Date("2026-08-10"), level: 2, source: "assessment", frameworkVersion: "1.0", proficiencyScale: "internal_0_5" },
    { date: new Date("2026-08-28"), level: 80, source: "quiz", frameworkVersion: "2.0", proficiencyScale: "percentage" }
  ])], [], [item()], range).items[0];
  assert.equal(result.observedChange.classification, "insufficient_evidence");
  assert.equal(result.observedChange.proficiencyDelta, undefined);
  assert.equal(result.framework.compatible, false);
});

test("multiple anchors remain separate and duplicate evidence references are deduplicated", () => {
  const first = item({ id: "first", outcomeId: "first-outcome", outcomeTimestamp: new Date("2026-08-15") });
  const second = item({ id: "second", outcomeId: "second-outcome", outcomeTimestamp: new Date("2026-08-25") });
  const duplicateAfter = item({ id: "duplicate", outcomeId: "duplicate-outcome", outcomeTimestamp: new Date("2026-08-28"), competencies: [{ competencyId: "comp-1", evidenceReference: "same-key", evidenceType: "quiz", historyTimestamp: new Date("2026-08-28"), strength: "direct" }] });
  const sameAfter = { ...duplicateAfter, id: "duplicate-copy", outcomeId: "duplicate-copy-outcome" };
  const result = buildCompetencyBeforeAfter([score([
    { date: new Date("2026-08-10"), level: 1, source: "assessment" },
    { date: new Date("2026-08-20"), level: 2, source: "quiz" },
    { date: new Date("2026-08-28"), level: 3, source: "quiz" }
  ])], [], [first, second, duplicateAfter, sameAfter], range);
  assert.equal(result.items.length, 4);
  assert.ok(result.items[0].learningAnchor.outcomeId !== result.items[1].learningAnchor.outcomeId);
  assert.ok(result.items.some((entry) => entry.evidence.after.filter((reference) => reference.evidenceReference === "same-key").length === 1));
});

test("personalization trace is context only and raw lab metadata is not returned", () => {
  const result = buildCompetencyBeforeAfter([score([
    { date: new Date("2026-08-10"), level: 2, source: "assessment" },
    { date: new Date("2026-08-28"), level: 3, source: "lab" }
  ])], [], [item({ metadata: { rawCode: "secret", providerSource: "local_record" }, personalization: { traceReference: "trace-1" } })], range).items[0];
  assert.equal(result.evidence.learningPeriod[0].personalizationTraceReference, "trace-1");
  assert.equal((result.evidence.learningPeriod[0] as any).rawCode, undefined);
  assert.match(result.limitations.join(" "), /causation/i);
});

test("service is learner-scoped and bounded without write side effects", async () => {
  const restores: Array<() => void> = [];
  let scoreFilter: any;
  let scoreLimit: number | undefined;
  patch(CompetencyScoreModel, "find", (filter: any) => {
    scoreFilter = filter;
    return { select: () => ({ limit: (value: number) => { scoreLimit = value; return { lean: async () => [score([
      { date: new Date("2026-08-10"), level: 2, source: "assessment" },
      { date: new Date("2026-08-28"), level: 3, source: "quiz" }
    ])] }; } }) };
  }, restores);
  patch(CompetencyModel, "find", () => query([{ _id: "comp-1", name: "Python" }]), restores);
  patch(lineageService, "getEvidenceLineage", async (userId: string, options: any) => {
    assert.equal(userId, "learner-1");
    assert.equal(options.limit, 250);
    return { dateRange: range, items: [item()] };
  }, restores);
  try {
    const result = await getCompetencyBeforeAfter("learner-1", { ...range, limit: 999 });
    assert.equal(scoreFilter.userId, "learner-1");
    assert.equal(scoreLimit, 250);
    assert.equal(result.items[0].competencyId, "comp-1");
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("repeated before/after execution is deterministic", () => {
  const inputScore = [score([
    { date: new Date("2026-08-10"), level: 2, source: "assessment" },
    { date: new Date("2026-08-28"), level: 3, source: "quiz" }
  ])];
  const first = buildCompetencyBeforeAfter(inputScore, [], [item()], range);
  const second = buildCompetencyBeforeAfter(inputScore, [], [item()], range);
  assert.deepEqual(first, second);
});
