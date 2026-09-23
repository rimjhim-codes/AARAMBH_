import assert from "node:assert/strict";
import test from "node:test";
import { scoreRecommendationCandidate } from "./recommendation.service";

const base = {
  course: {
    id: "SQL-101", title: "Advanced SQL for Analysts", description: "Queries and data modelling",
    provider: "Local", competencies: ["SQL"], keywords: ["database"], source: "platform_catalog" as const
  },
  gap: { competencyId: "sql-id", currentLevel: 2, requiredLevel: 4, gap: 2, priority: "high" },
  competency: { _id: "sql-id", code: "SQL", name: "SQL", keywords: ["database"] }
};

test("recommendation score prioritizes larger gaps and matched competencies", () => {
  const result = scoreRecommendationCandidate(base);
  const smaller = scoreRecommendationCandidate({ ...base, gap: { ...base.gap, gap: 1 } });
  assert.ok(result.score > smaller.score);
  assert.deepEqual(result.matchedCompetencies, ["SQL"]);
});

test("role, department, and assignment context are additive only when configured", () => {
  const contextual = scoreRecommendationCandidate({
    ...base,
    profile: { department: "DS", currentAssignment: "Census" },
    requirements: [{ competencyId: "sql-id", departmentCode: "DS", assignment: "Census", priorityWeight: 2 }]
  });
  const generic = scoreRecommendationCandidate({ ...base, profile: { department: "DS", currentAssignment: "Other" }, requirements: [] });
  assert.ok(contextual.score > generic.score);
  assert.ok(contextual.reasonCodes.includes("department_context"));
  assert.ok(contextual.reasonCodes.includes("assignment_context"));
});

test("prior training is visible and penalizes duplicate recommendations", () => {
  const result = scoreRecommendationCandidate({ ...base, priorTraining: ["Advanced SQL for Analysts"] });
  assert.equal(result.prior, true);
  assert.ok(result.reasonCodes.includes("prior_training_overlap"));
  assert.ok(result.breakdown.redundancyPenalty < 0);
});

test("assessment, quiz, and lab evidence improves explainable performance fit", () => {
  const result = scoreRecommendationCandidate({ ...base, score: { evidence: [{ type: "quiz", detail: "Accuracy 55%" }] } });
  assert.equal(result.breakdown.performanceFit, 8);
  assert.ok(result.reasonCodes.includes("evidence_performance"));
});

test("missing history is safe and completed state is represented", () => {
  const result = scoreRecommendationCandidate({ ...base, existingState: "completed" });
  assert.ok(result.score >= 0);
  assert.ok(result.reasonCodes.includes("existing_completed"));
});
