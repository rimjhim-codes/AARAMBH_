import assert from "node:assert/strict";
import test from "node:test";
import {
  canFinalizeCompetencyAssessment,
  finalizationKey,
  validateFinalizableQuestionSet
} from "./competency-assessment-finalization.service";
import { validateAssessmentBlueprint } from "./assessment-blueprint.service";

function blueprint() {
  return validateAssessmentBlueprint({
    blueprintId: "finalization-test-v1",
    name: "Finalization test blueprint",
    version: "1.0",
    purpose: "Application-defined test blueprint.",
    coverage: [
      { competencyId: "a", domain: "statistics", questionCount: 2 },
      { competencyId: "b", domain: "digital", questionCount: 2 }
    ],
    questionCount: 4,
    difficultyDistribution: { easy: 1, medium: 2, hard: 1 },
    questionType: "mcq"
  });
}

function question(id: string, competencyId: string, difficulty: "easy" | "medium" | "hard", overrides: Record<string, unknown> = {}) {
  return {
    _id: id,
    competencyId,
    question: `Which measure is useful for ${id} in a statistical dataset?`,
    options: { A: "Mean", B: "Median", C: "Variance", D: "Mode" },
    correctAnswer: "A",
    explanation: "The selected measure is appropriate for the stated context.",
    difficulty,
    topic: "descriptive statistics",
    status: "approved",
    validationStatus: "passed",
    ...overrides
  };
}

function completeSet() {
  return [
    question("q1", "a", "easy"),
    question("q2", "a", "medium"),
    question("q3", "b", "medium"),
    question("q4", "b", "hard")
  ];
}

test("successful finalization validates coverage and preserves question domains", () => {
  const result = validateFinalizableQuestionSet(completeSet() as any, blueprint());
  assert.deepEqual(result.metadata, [
    { questionId: "q1", competencyId: "a", domain: "statistics" },
    { questionId: "q2", competencyId: "a", domain: "statistics" },
    { questionId: "q3", competencyId: "b", domain: "digital" },
    { questionId: "q4", competencyId: "b", domain: "digital" }
  ]);
});

test("finalization rejects missing or incomplete blueprint coverage", () => {
  assert.throws(() => validateFinalizableQuestionSet(completeSet().slice(0, 3) as any, blueprint()), /expected 4/);
  assert.throws(() => validateFinalizableQuestionSet([
    question("q1", "a", "easy"), question("q2", "a", "medium"),
    question("q3", "a", "medium"), question("q4", "b", "hard")
  ] as any, blueprint()), /Competency a has 3/);
});

test("finalization rejects pending, rejected, and structurally invalid questions", () => {
  for (const status of ["pending_review", "rejected"]) {
    const items = completeSet();
    items[0] = question("q1", "a", "easy", { status });
    assert.throws(() => validateFinalizableQuestionSet(items as any, blueprint()), /cannot be used/);
  }
  const invalid = completeSet();
  invalid[0] = question("q1", "a", "easy", { options: { A: "Only one option" } });
  assert.throws(() => validateFinalizableQuestionSet(invalid as any, blueprint()), /structural validation/);
});

test("finalization rejects failed validation, duplicate questions, and wrong difficulty", () => {
  const failed = completeSet();
  failed[0] = question("q1", "a", "easy", { validationStatus: "failed" });
  assert.throws(() => validateFinalizableQuestionSet(failed as any, blueprint()), /failed quality/);

  const duplicate = completeSet();
  duplicate[1] = { ...duplicate[0], _id: "q2" };
  assert.throws(() => validateFinalizableQuestionSet(duplicate as any, blueprint()), /duplicates another/);

  const wrongDifficulty = completeSet();
  wrongDifficulty[3] = question("q4", "b", "medium");
  assert.throws(() => validateFinalizableQuestionSet(wrongDifficulty as any, blueprint()), /Difficulty coverage/);
});

test("finalization key is idempotent for the same assessment and question set", () => {
  const input = { assessmentId: "assessment-1", blueprintId: "bp", blueprintVersion: "1.0", questionIds: ["q2", "q1"] };
  assert.equal(finalizationKey(input), finalizationKey({ ...input, questionIds: ["q1", "q2"] }));
  assert.notEqual(finalizationKey(input), finalizationKey({ ...input, assessmentId: "assessment-2" }));
});

test("only faculty and admin reviewers can finalize", () => {
  assert.equal(canFinalizeCompetencyAssessment({ role: "admin" }), true);
  assert.equal(canFinalizeCompetencyAssessment({ role: "faculty" }), true);
  assert.equal(canFinalizeCompetencyAssessment({ role: "employee" }), false);
  assert.equal(canFinalizeCompetencyAssessment(undefined), false);
});
