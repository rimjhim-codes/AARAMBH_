import assert from "node:assert/strict";
import test from "node:test";
import { CompetencyModel, LearningRecommendationModel, PlatformCourseModel } from "../models/sih/SihModels";
import { LearningOutcomeEventModel } from "../models/LearningOutcomeEvent";
import { LearningProgressModel } from "../models/LearningProgress";
import * as lineageService from "./evidence-lineage.service";
import * as beforeAfterService from "./competency-before-after.service";
import {
  getPlatformCourseEffectiveness,
  PlatformCourseNotFoundError
} from "./platform-course-effectiveness.service";
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

function course(input: Partial<any> = {}) {
  return {
    code: "PLAT_PYTHON_FUND",
    title: "Python for Statistical Computing",
    description: "Python basics",
    provider: "ARAMBH",
    difficulty: "beginner",
    durationHours: 10,
    competencyCodes: ["TECH_PYTHON", "MISSING_CODE"],
    lectureIds: ["lecture-1"],
    catalogType: "platform",
    isActive: true,
    ...input
  };
}

function progress(input: Partial<any> = {}) {
  return {
    resourceType: "platform_course",
    resourceId: "PLAT_PYTHON_FUND",
    source: "platform",
    progressPercent: 100,
    status: "completed",
    startedAt: new Date("2026-08-10"),
    lastActivityAt: new Date("2026-08-25"),
    completedAt: new Date("2026-08-25"),
    completedOutcomeEventId: "loe-course",
    metadata: { title: "Python for Statistical Computing", rawCode: "must-not-leak" },
    ...input
  };
}

function outcome(input: Partial<any> = {}) {
  return {
    eventId: "loe-course",
    sourceEventId: "learner:platform:PLAT_PYTHON_FUND:completion",
    eventType: "course.completed",
    resourceType: "course",
    resourceId: "PLAT_PYTHON_FUND",
    source: "platform",
    occurredAt: new Date("2026-08-25"),
    status: "processed",
    competencyIds: [],
    metadata: { competencyEvidence: false },
    ...input
  };
}

function recommendation(input: Partial<any> = {}) {
  return {
    _id: "recommendation-1",
    status: "completed",
    matchedCompetencies: ["TECH_PYTHON"],
    solvedGaps: ["gap-1"],
    reasonCodes: ["competency_gap"],
    reasonSummary: "Addresses the Python gap",
    confidence: "medium",
    personalizationFactors: ["role_relevance"],
    ...input
  };
}

function lineageItem(input: Partial<any> = {}) {
  return {
    id: "outcome:loe-course",
    source: "learning_outcome",
    sourceId: "loe-course",
    resourceType: "course",
    resourceId: "PLAT_PYTHON_FUND",
    title: "course.completed",
    status: "completed",
    outcomeId: "loe-course",
    outcomeType: "course.completed",
    outcomeSource: "platform",
    outcomeTimestamp: new Date("2026-08-25"),
    validatedOutcome: true,
    competencyIds: [],
    competencies: [],
    lineageStrength: "unavailable",
    lineageStatus: "unavailable",
    ...input
  };
}

function installBase(stubs: {
  course?: any;
  progress?: any;
  outcome?: any;
  recommendation?: any;
  mapped?: any[];
  lineage?: any[];
  beforeAfter?: any;
}) {
  const restores: Array<() => void> = [];
  patch(PlatformCourseModel, "findOne", () => query(stubs.course === undefined ? course() : stubs.course), restores);
  patch(LearningProgressModel, "findOne", () => query(stubs.progress === undefined ? progress() : stubs.progress), restores);
  patch(LearningOutcomeEventModel, "findOne", (filter: any) => {
    const candidate = stubs.outcome === undefined ? outcome() : stubs.outcome;
    return query(
      filter?.eventId && candidate && candidate.eventId !== filter.eventId
        || filter?.source && candidate && candidate.source !== filter.source
        ? null
        : candidate
    );
  }, restores);
  patch(LearningRecommendationModel, "findOne", () => query(stubs.recommendation === undefined ? recommendation() : stubs.recommendation), restores);
  patch(CompetencyModel, "find", () => query(stubs.mapped || [{ _id: "competency-1", code: "TECH_PYTHON", name: "Python" }]), restores);
  patch(lineageService, "getEvidenceLineage", async () => ({ dateRange: {} as any, items: stubs.lineage || [lineageItem()] }), restores);
  patch(beforeAfterService, "getCompetencyBeforeAfter", async () => stubs.beforeAfter || { anchors: [], items: [], limitations: [] }, restores);
  return restores;
}

test("missing platform course returns a not-found error", async () => {
  const restores = installBase({ course: null });
  try {
    await assert.rejects(
      () => getPlatformCourseEffectiveness("learner-1", "UNKNOWN", { now: new Date("2026-09-08") }),
      PlatformCourseNotFoundError
    );
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("in-progress and missing-progress courses remain not completed", async () => {
  const restores = installBase({ progress: null, outcome: null, recommendation: null, lineage: [] });
  try {
    const result = await getPlatformCourseEffectiveness("learner-1", "PLAT_PYTHON_FUND", { now: new Date("2026-09-08") });
    assert.equal(result.completion.completed, false);
    assert.equal(result.interpretation, "NOT_COMPLETED");
    assert.equal(result.progress, null);
    assert.equal(result.outcome, null);
    assert.equal(result.recommendationContext, null);
    assert.match(result.interpretationSummary, /not been validated/i);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }

  const inProgressRestores = installBase({
    progress: progress({ progressPercent: 45, status: "in_progress", completedAt: undefined, completedOutcomeEventId: undefined }),
    outcome: null,
    lineage: []
  });
  try {
    const result = await getPlatformCourseEffectiveness("learner-1", "PLAT_PYTHON_FUND", { now: new Date("2026-09-08") });
    assert.equal(result.progress?.progressPercent, 45);
    assert.equal(result.completion.progressCompleted, false);
    assert.equal(result.interpretation, "NOT_COMPLETED");
  } finally {
    inProgressRestores.reverse().forEach((restore) => restore());
  }
});

test("completed platform course remains completion-only when outcome has no competency evidence", async () => {
  const restores = installBase({});
  try {
    const result = await getPlatformCourseEffectiveness("learner-1", "PLAT_PYTHON_FUND", { now: new Date("2026-09-08") });
    assert.equal(result.completion.completed, true);
    assert.equal(result.completion.validated, true);
    assert.equal(result.outcome?.eventId, "loe-course");
    assert.deepEqual(result.outcome?.competencyIds, []);
    assert.equal(result.lineage.strength, "unavailable");
    assert.equal(result.interpretation, "COMPLETED_NO_EVIDENCE");
    assert.equal(result.catalogCompetencyContext[0].isEvidence, false);
    assert.equal(result.catalogCompetencyContext[0].mappingStatus, "resolved");
    assert.equal(result.catalogCompetencyContext[1].mappingStatus, "unresolved");
    assert.equal(result.recommendationContext?.recommendationId, "recommendation-1");
    assert.equal((result.progress?.metadata as any)?.rawCode, undefined);
    assert.match(result.interpretationSummary, /no persisted competency evidence is available/i);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("persisted competency IDs reuse before/after analysis and can support improvement", async () => {
  const restores = installBase({
    outcome: outcome({ competencyIds: ["competency-1"] }),
    lineage: [lineageItem({
      competencyIds: ["competency-1"],
      lineageStrength: "direct",
      lineageStatus: "complete",
      competencies: [{ competencyId: "competency-1", evidenceReference: "outcome:loe-course:competency-1", strength: "direct" }]
    })],
    beforeAfter: {
      anchors: [],
      items: [{
        learningAnchor: { outcomeId: "loe-course" },
        observedChange: { classification: "improved", proficiencyDelta: 1 },
        confidence: "medium",
        limitations: []
      }],
      limitations: []
    }
  });
  try {
    const result = await getPlatformCourseEffectiveness("learner-1", "PLAT_PYTHON_FUND", { now: new Date("2026-09-08") });
    assert.equal(result.interpretation, "IMPROVEMENT_SUPPORTED");
    assert.equal(result.competencyObservation.classification, "improved");
    assert.equal(result.competencyObservation.items[0].observedChange.proficiencyDelta, 1);
    assert.equal(result.lineage.strength, "direct");
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("catalog context cannot produce improvement when evidence lineage is unavailable", async () => {
  const restores = installBase({
    outcome: outcome({ competencyIds: ["competency-1"] }),
    lineage: [lineageItem({ competencyIds: ["competency-1"], lineageStrength: "unavailable" })],
    beforeAfter: {
      anchors: [],
      items: [{
        learningAnchor: { outcomeId: "loe-course" },
        observedChange: { classification: "improved", proficiencyDelta: 1 },
        confidence: "high",
        limitations: []
      }],
      limitations: []
    }
  });
  try {
    const result = await getPlatformCourseEffectiveness("learner-1", "PLAT_PYTHON_FUND", { now: new Date("2026-09-08") });
    assert.equal(result.competencyObservation.classification, "insufficient_evidence");
    assert.equal(result.interpretation, "INSUFFICIENT_EVIDENCE");
    assert.equal(result.lineage.strength, "unavailable");
    assert.match(result.interpretationSummary, /insufficient/i);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("a stored completion outcome reference is required when present", async () => {
  const restores = installBase({
    progress: progress({ completedOutcomeEventId: "different-outcome" }),
    outcome: outcome({ eventId: "loe-course" }),
    lineage: []
  });
  try {
    const result = await getPlatformCourseEffectiveness("learner-1", "PLAT_PYTHON_FUND", { now: new Date("2026-09-08") });
    assert.equal(result.progress?.completedOutcomeEventId, "different-outcome");
    assert.equal(result.outcome, null);
    assert.equal(result.completion.completed, false);
    assert.equal(result.interpretation, "INSUFFICIENT_EVIDENCE");
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("a mismatched provider outcome cannot complete a platform course", async () => {
  const restores = installBase({
    outcome: outcome({ source: "igot" }),
    lineage: []
  });
  try {
    const result = await getPlatformCourseEffectiveness("learner-1", "PLAT_PYTHON_FUND", { now: new Date("2026-09-08") });
    assert.equal(result.outcome, null);
    assert.equal(result.completion.completed, false);
    assert.match(result.interpretationSummary, /processed course completion outcome is not available/i);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("framework mismatch or missing post-course observation remains insufficient", async () => {
  const restores = installBase({
    outcome: outcome({ competencyIds: ["competency-1"] }),
    beforeAfter: {
      anchors: [],
      items: [{
        learningAnchor: { outcomeId: "loe-course" },
        observedChange: { classification: "insufficient_evidence" },
        confidence: "insufficient",
        framework: { compatible: false },
        limitations: ["Framework mismatch"]
      }],
      limitations: ["Framework mismatch"]
    }
  });
  try {
    const result = await getPlatformCourseEffectiveness("learner-1", "PLAT_PYTHON_FUND", { now: new Date("2026-09-08") });
    assert.equal(result.interpretation, "INSUFFICIENT_EVIDENCE");
    assert.equal(result.competencyObservation.confidence, "insufficient");
    assert.ok(result.limitations.some((item) => /framework mismatch/i.test(item)));
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("date range is canonical, bounded, and the read path has no write methods", async () => {
  const restores = installBase({});
  try {
    await assert.rejects(
      () => getPlatformCourseEffectiveness("learner-1", "PLAT_PYTHON_FUND", { from: "2025-01-01", to: "2026-09-08", now: new Date("2026-09-08") }),
      AnalyticsDateRangeError
    );
    await assert.rejects(
      () => getPlatformCourseEffectiveness("learner-1", "PLAT_PYTHON_FUND", { from: "2026-09-08", to: "2026-09-07", now: new Date("2026-09-08") }),
      AnalyticsDateRangeError
    );
    assert.equal(typeof (getPlatformCourseEffectiveness as any).create, "undefined");
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
