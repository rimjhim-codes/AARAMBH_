import assert from "node:assert/strict";
import test from "node:test";
import {
  AssessmentBlueprintValidationError,
  buildFallbackAssessmentBlueprint,
  buildQuestionRequirements,
  validateAssessmentBlueprint,
  validateAssessmentQuestionCoverage
} from "./assessment-blueprint.service";
import { CompetencyAssessmentModel } from "../models/sih/SihModels";

function blueprint(overrides: Partial<Parameters<typeof validateAssessmentBlueprint>[0]> = {}) {
  return validateAssessmentBlueprint({
    blueprintId: "data-skills-v1",
    name: "Data skills assessment",
    version: "1.0",
    purpose: "Application-defined competency coverage test blueprint.",
    coverage: [
      { competencyId: "a", domain: "technical", questionCount: 2 },
      { competencyId: "b", domain: "statistical", questionCount: 2 }
    ],
    questionCount: 4,
    difficultyDistribution: { easy: 1, medium: 2, hard: 1 },
    questionType: "mcq",
    ...overrides
  });
}

test("validates a versioned blueprint and preserves its version", () => {
  assert.equal(blueprint().version, "1.0");
  assert.equal(blueprint({ version: "2.0" }).version, "2.0");
  assert.equal(blueprint({ timeLimitMinutes: 30 }).timeLimitMinutes, 30);
});

test("rejects incomplete coverage and difficulty totals", () => {
  assert.throws(
    () => blueprint({ questionCount: 5 }),
    (error) => error instanceof AssessmentBlueprintValidationError && /coverage totals/.test(error.message)
  );
  assert.throws(
    () => blueprint({ difficultyDistribution: { easy: 0, medium: 0, hard: 0 } }),
    (error) => error instanceof AssessmentBlueprintValidationError && /difficulty distribution totals/i.test(error.message)
  );
});

test("rejects duplicate competency coverage and invalid experience range", () => {
  assert.throws(
    () => blueprint({ coverage: [{ competencyId: "a", questionCount: 2 }, { competencyId: "a", questionCount: 2 }] }),
    AssessmentBlueprintValidationError
  );
  assert.throws(
    () => blueprint({ experienceRelevance: { minYears: 8, maxYears: 3 } }),
    AssessmentBlueprintValidationError
  );
});

test("allocates deterministic question requirements with exact global difficulty totals", () => {
  const requirements = buildQuestionRequirements(blueprint());
  assert.deepEqual(requirements.map((item) => item.questionCount), [2, 2]);
  assert.deepEqual(
    requirements.reduce((total, item) => ({
      easy: total.easy + item.difficultyDistribution.easy,
      medium: total.medium + item.difficultyDistribution.medium,
      hard: total.hard + item.difficultyDistribution.hard
    }), { easy: 0, medium: 0, hard: 0 }),
    { easy: 1, medium: 2, hard: 1 }
  );
});

test("accepts complete competency and difficulty coverage", () => {
  assert.deepEqual(
    validateAssessmentQuestionCoverage([
      { competencyId: "a", difficulty: "easy", questionType: "mcq" },
      { competencyId: "a", difficulty: "medium", questionType: "mcq" },
      { competencyId: "b", difficulty: "medium", questionType: "mcq" },
      { competencyId: "b", difficulty: "hard", questionType: "mcq" }
    ], blueprint()).difficultyDistribution,
    { easy: 1, medium: 2, hard: 1 }
  );
});

test("rejects incomplete competency coverage", () => {
  assert.throws(
    () => validateAssessmentQuestionCoverage([
      { competencyId: "a", difficulty: "easy" },
      { competencyId: "a", difficulty: "medium" },
      { competencyId: "a", difficulty: "medium" },
      { competencyId: "b", difficulty: "hard" }
    ], blueprint()),
    (error) => error instanceof AssessmentBlueprintValidationError && /Competency a has 3/.test(error.message)
  );
});

test("fallback blueprint is deterministic and explicitly application-defined", () => {
  const fallback = buildFallbackAssessmentBlueprint({ competencyIds: ["a", "b"], questionCountPerCompetency: 5 });
  assert.equal(fallback.blueprintId, "aarambh-application-assessment-fallback");
  assert.equal(fallback.version, "1.0");
  assert.equal(fallback.questionCount, 10);
  assert.deepEqual(fallback.difficultyDistribution, { easy: 2, medium: 6, hard: 2 });
});

test("legacy competency assessments remain readable without blueprint metadata", () => {
  assert.ok(CompetencyAssessmentModel.schema.path("blueprintId"));
  assert.ok(CompetencyAssessmentModel.schema.path("blueprintVersion"));
  assert.notEqual(CompetencyAssessmentModel.schema.path("blueprintId").isRequired, true);
  assert.notEqual(CompetencyAssessmentModel.schema.path("blueprintVersion").isRequired, true);
});
