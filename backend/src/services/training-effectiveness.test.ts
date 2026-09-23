import assert from "node:assert/strict";
import test from "node:test";
import {
  CompetencyScoreModel,
  LearningRecommendationModel,
  IGOTEnrollmentModel,
  NSSTAEnrollmentModel
} from "../models/sih/SihModels";
import { LearningOutcomeEventModel } from "../models/LearningOutcomeEvent";
import { LearningProgressModel } from "../models/LearningProgress";
import * as lineageService from "./evidence-lineage.service";
import * as beforeAfterService from "./competency-before-after.service";
import { syncTrainingCompletion } from "./recommendation.service";
import {
  getTrainingEffectiveness,
  TrainingEffectivenessResourceNotFoundError
} from "./training-effectiveness.service";
import { AnalyticsDateRangeError } from "./analytics-foundation.service";

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
}

function query<T>(value: T) {
  return {
    select: () => ({ lean: async () => value }),
    sort: () => ({ lean: async () => value }),
    lean: async () => value
  };
}

function enrollment(source: "igot" | "nssta", overrides: Record<string, unknown> = {}) {
  return source === "igot"
    ? {
      courseId: "course-1",
      title: "iGOT Statistics",
      status: "completed",
      progressPercent: 100,
      source: "igot_simulated",
      externalEnrollmentId: "igot-enrollment-1",
      completedAt: new Date("2026-08-20"),
      ...overrides
    }
    : {
      programmeId: "programme-1",
      title: "NSSTA TPAC Sampling",
      status: "completed",
      progressPercent: 100,
      source: "nssta_simulated",
      externalEnrollmentId: "nssta-enrollment-1",
      completedAt: new Date("2026-08-20"),
      ...overrides
    };
}

function progress(resourceType: string, resourceId: string, overrides: Record<string, unknown> = {}) {
  return {
    resourceType,
    resourceId,
    source: resourceType === "igot_course" ? "igot" : "nssta",
    progressPercent: 100,
    status: "completed",
    startedAt: new Date("2026-08-01"),
    lastActivityAt: new Date("2026-08-20"),
    completedAt: new Date("2026-08-20"),
    completedOutcomeEventId: "outcome-1",
    metadata: { rawCode: "must-not-leak" },
    ...overrides
  };
}

function outcome(source: "igot" | "nssta", overrides: Record<string, unknown> = {}) {
  return {
    eventId: "outcome-1",
    sourceEventId: `user-1:${source}:completion`,
    eventType: source === "igot" ? "course.completed" : "training.completed",
    resourceType: source === "igot" ? "course" : "training",
    resourceId: source === "igot" ? "course-1" : "programme-1",
    source,
    occurredAt: new Date("2026-08-20"),
    status: "processed",
    competencyIds: [],
    metadata: { providerSource: `${source}_simulated` },
    ...overrides
  };
}

function lineageItem(source: "igot" | "nssta", overrides: Record<string, unknown> = {}) {
  return {
    id: `outcome:outcome-1`,
    source,
    sourceId: "outcome-1",
    resourceType: source === "igot" ? "course" : "training",
    resourceId: source === "igot" ? "course-1" : "programme-1",
    title: "completion",
    status: "completed",
    outcomeId: "outcome-1",
    outcomeType: source === "igot" ? "course.completed" : "training.completed",
    outcomeSource: source,
    outcomeTimestamp: new Date("2026-08-20"),
    validatedOutcome: true,
    competencyIds: [],
    competencies: [],
    lineageStrength: "unavailable",
    lineageStatus: "unavailable",
    ...overrides
  };
}

function installBase(source: "igot" | "nssta", input: {
  enrollment?: any;
  progress?: any;
  outcome?: any;
  recommendation?: any;
  lineage?: any[];
  beforeAfter?: any;
} = {}) {
  const restores: Array<() => void> = [];
  patch(source === "igot" ? IGOTEnrollmentModel : NSSTAEnrollmentModel, "findOne", () => query(input.enrollment === undefined ? enrollment(source) : input.enrollment), restores);
  patch(LearningProgressModel, "findOne", () => query(input.progress === undefined ? progress(source === "igot" ? "igot_course" : "nssta_course", source === "igot" ? "course-1" : "programme-1") : input.progress), restores);
  patch(LearningOutcomeEventModel, "findOne", (filter: any) => {
    const candidate = input.outcome === undefined ? outcome(source) : input.outcome;
    const mismatch = candidate && ((filter?.eventId && candidate.eventId !== filter.eventId)
      || (filter?.source && candidate.source !== filter.source));
    return query(mismatch ? null : candidate);
  }, restores);
  patch(LearningRecommendationModel, "findOne", () => query(input.recommendation === undefined ? null : input.recommendation), restores);
  patch(lineageService, "getEvidenceLineage", async () => ({ dateRange: {} as any, items: input.lineage || [lineageItem(source)] }), restores);
  patch(beforeAfterService, "getCompetencyBeforeAfter", async () => input.beforeAfter || { anchors: [], items: [], limitations: [] }, restores);
  return restores;
}

test("completion governance does not mutate competency from recommendation mappings", async () => {
  const restores: Array<() => void> = [];
  let scoreWrites = 0;
  patch(LearningRecommendationModel, "findOne", () => query({ _id: "recommendation-1", title: "Mapped course", competencyId: "competency-1" }), restores);
  patch(LearningRecommendationModel, "updateOne", async () => ({}), restores);
  patch(CompetencyScoreModel, "findOneAndUpdate", async () => { scoreWrites += 1; return {}; }, restores);
  try {
    const result = await syncTrainingCompletion({ userId: "user-1", source: "igot", externalId: "course-1", completed: true, refreshSkillGaps: false });
    assert.equal(result.competencyUpdated, false);
    assert.equal(scoreWrites, 0);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("iGOT completion is reported with provider identity but without competency evidence", async () => {
  const restores = installBase("igot", { recommendation: { _id: "rec-1", source: "igot", externalId: "course-1", matchedCompetencies: ["STAT"], solvedGaps: ["gap-1"], reasonCodes: ["competency_gap"], confidence: "medium", personalizationFactors: ["role"] } });
  try {
    const result = await getTrainingEffectiveness("user-1", "igot", "course-1", { now: new Date("2026-09-08") });
    assert.equal(result.completion.completed, true);
    assert.equal(result.enrollment?.externalEnrollmentId, "igot-enrollment-1");
    assert.equal(result.resource.providerSource, "igot_simulated");
    assert.equal(result.outcome?.eventId, "outcome-1");
    assert.equal(result.competencyObservation.classification, "insufficient_evidence");
    assert.equal(result.lineage.strength, "unavailable");
    assert.equal(result.interpretation, "COMPLETED_NO_EVIDENCE");
    assert.deepEqual(result.catalogCompetencyContext, []);
    assert.equal(result.recommendationContext?.recommendationId, "rec-1");
    assert.equal((result.progress as any)?.metadata, undefined);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("NSSTA completion preserves simulated source and rejects an unrelated outcome", async () => {
  const restores = installBase("nssta", {
    progress: progress("nssta_course", "programme-1", { completedOutcomeEventId: "different-outcome" }),
    outcome: outcome("nssta"),
    lineage: []
  });
  try {
    const result = await getTrainingEffectiveness("user-1", "nssta", "programme-1", { now: new Date("2026-09-08") });
    assert.equal(result.resource.providerSource, "nssta_simulated");
    assert.equal(result.resource.externalId, "nssta-enrollment-1");
    assert.equal(result.outcome, null);
    assert.equal(result.completion.completed, false);
    assert.equal(result.interpretation, "INSUFFICIENT_EVIDENCE");
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("internal training does not fabricate an authoritative completion", async () => {
  const restores: Array<() => void> = [];
  patch(LearningProgressModel, "findOne", () => query(null), restores);
  patch(LearningOutcomeEventModel, "findOne", () => query(null), restores);
  patch(LearningRecommendationModel, "findOne", () => query(null), restores);
  patch(lineageService, "getEvidenceLineage", async () => ({ dateRange: {} as any, items: [] }), restores);
  try {
    const result = await getTrainingEffectiveness("user-1", "training", "internal-1", { now: new Date("2026-09-08") });
    assert.equal(result.enrollment, null);
    assert.equal(result.completion.completed, false);
    assert.equal(result.interpretation, "INSUFFICIENT_EVIDENCE");
    assert.ok(result.limitations.some((item) => /authoritative internal-training/i.test(item)));
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("explicit persisted competency lineage can support before/after improvement", async () => {
  const restores = installBase("igot", {
    outcome: outcome("igot", { competencyIds: ["competency-1"] }),
    lineage: [lineageItem("igot", {
      competencyIds: ["competency-1"],
      lineageStrength: "direct",
      lineageStatus: "complete",
      competencies: [{ competencyId: "competency-1", evidenceReference: "outcome:outcome-1:competency-1", strength: "direct" }]
    })],
    beforeAfter: {
      anchors: [],
      items: [{ learningAnchor: { outcomeId: "outcome-1" }, observedChange: { classification: "improved", proficiencyDelta: 1 }, confidence: "medium", limitations: [] }],
      limitations: []
    }
  });
  try {
    const result = await getTrainingEffectiveness("user-1", "igot", "course-1", { now: new Date("2026-09-08") });
    assert.equal(result.interpretation, "IMPROVEMENT_SUPPORTED");
    assert.equal(result.competencyObservation.items[0].observedChange.proficiencyDelta, 1);
    assert.equal(result.lineage.strength, "direct");
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("missing resource, invalid range, and read-only result are handled safely", async () => {
  const restores = installBase("igot", { enrollment: null, progress: null, outcome: null, lineage: [] });
  try {
    const result = await getTrainingEffectiveness("user-1", "igot", "course-1", { now: new Date("2026-09-08") });
    assert.equal(result.enrollment, null);
    assert.equal(result.progress, null);
    assert.equal(result.outcome, null);
    assert.ok(Array.isArray(result.lineage.items));
    assert.ok(Array.isArray(result.limitations));
    await assert.rejects(
      () => getTrainingEffectiveness("user-1", "igot", "course-1", { from: "2025-01-01", to: "2026-09-08", now: new Date("2026-09-08") }),
      AnalyticsDateRangeError
    );
  } finally { restores.reverse().forEach((restore) => restore()); }

  await assert.rejects(
    () => getTrainingEffectiveness("user-1", "igot", "", { now: new Date("2026-09-08") }),
    TrainingEffectivenessResourceNotFoundError
  );
});
