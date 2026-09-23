import assert from "node:assert/strict";
import test from "node:test";
import {
  McqSchema,
  calculateQuestionAnalytics,
  detectSemanticDuplicateMcqs,
  deriveAttemptIntegrityFlags,
  normalizeQuestionText,
  persistGeneratedQuestions,
  validateMcqSemantics,
  validateGeneratedMcqs,
  validateMcqQuality
} from "./quiz-engine.service";

test("attempt integrity flags preserve browser events and detect implausibly fast attempts", () => {
  const result = deriveAttemptIntegrityFlags({
    averageResponseTimeMs: 1500,
    suspiciousActivityCount: 2,
    suspiciousActivityReasons: ["tab_or_window_blur"]
  });
  assert.equal(result.suspiciousActivityCount, 2);
  assert.deepEqual(result.suspiciousActivityReasons.sort(), [
    "implausibly_low_average_response_time",
    "tab_or_window_blur"
  ]);
});

function validQuestion(overrides: Record<string, unknown> = {}) {
  return {
    question: "Which measure best describes this dataset?",
    options: { A: "Mean", B: "Median", C: "Variance", D: "Mode" },
    correctAnswer: "A",
    explanation: "The mean is the arithmetic average.",
    difficulty: "medium",
    topic: "descriptive statistics",
    ...overrides
  };
}

test("MCQ structural validation rejects malformed options and metadata", () => {
  assert.equal(McqSchema.safeParse(validQuestion({ options: { A: "Mean", B: "Median", C: "Variance" } })).success, false);
  assert.equal(McqSchema.safeParse(validQuestion({ topic: "" })).success, false);
  assert.equal(McqSchema.safeParse(validQuestion({ correctAnswer: "E" })).success, false);
  assert.throws(() => validateGeneratedMcqs([validQuestion({ explanation: "" })] as any), /structural validation/);
});

test("quality validation flags placeholders, repeated options, and compound options", () => {
  const result = validateMcqQuality(validQuestion({
    options: { A: "Mean", B: "Mean", C: "None of the above", D: "placeholder" }
  }) as any);
  assert.deepEqual(result.qualityFlags.sort(), [
    "compound_all_or_none_option",
    "placeholder_distractor"
  ]);
  assert.deepEqual(result.reasons, ["duplicate_option_values"]);
});

test("normalized duplicate questions are rejected within one generated assessment", () => {
  const first = validQuestion();
  const second = validQuestion({ question: " Which measure best describes this dataset?! " });
  assert.equal(normalizeQuestionText(first.question), normalizeQuestionText(second.question));
  assert.throws(() => validateGeneratedMcqs([first, second] as any), /duplicates another question/);
});

test("AI-generated questions cannot bypass the pending-review gate", async () => {
  await assert.rejects(
    persistGeneratedQuestions({ questions: [validQuestion() as any], createdBy: "user-1", status: "published" }),
    /must remain pending review/
  );
});

test("semantic MCQ validation returns structured provider results without chain-of-thought", async () => {
  const result = await validateMcqSemantics([validQuestion() as any], undefined, async () => ({
    provider: "test-semantic",
    data: [{ valid: false, reasons: ["answer is ambiguous"], qualityFlags: ["ambiguity"] }]
  }));
  assert.deepEqual(result, [{
    status: "flagged",
    reasons: ["answer is ambiguous"],
    qualityFlags: ["ambiguity"],
    provider: "test-semantic"
  }]);
});

test("semantic validation fails safe for provider and malformed responses", async () => {
  const failed = await validateMcqSemantics([validQuestion() as any], undefined, async () => {
    throw new Error("provider failed");
  });
  assert.equal(failed[0].status, "unavailable");
  const malformed = await validateMcqSemantics([validQuestion() as any], undefined, async () => ({
    provider: "test-semantic",
    data: []
  }));
  assert.equal(malformed[0].status, "unavailable");
});

test("semantic duplicate detection flags similar vectors and ignores different vectors", async () => {
  const result = await detectSemanticDuplicateMcqs(
    [validQuestion(), validQuestion({ question: "Which statistic summarizes this dataset most effectively?" }), validQuestion({ question: "Which chart displays category frequencies?" })] as any,
    async () => [[1, 0], [0.99, 0.1], [0, 1]]
  );
  assert.deepEqual(result.duplicatePairs, [[0, 1]]);
  const unavailable = await detectSemanticDuplicateMcqs([validQuestion(), validQuestion({ question: "A different question about charts" })] as any, async () => {
    throw new Error("embedding unavailable");
  });
  assert.equal(unavailable.available, false);
});

test("question analytics reports only metrics supported by stored attempts", () => {
  const result = calculateQuestionAnalytics("q1", [
    { answers: [{ questionId: "q1", selected: "A", correct: true, responseTimeMs: 1000 }] },
    { answers: [{ questionId: "q1", selected: "B", correct: false, responseTimeMs: 3000 }] },
    { answers: [{ questionId: "q1", selected: "", correct: false }] }
  ], "medium");
  assert.deepEqual(result, {
    questionId: "q1",
    attempts: 3,
    correctCount: 1,
    incorrectCount: 1,
    skippedCount: 1,
    accuracy: 33,
    skipRate: 33,
    averageResponseTimeMs: 2000,
    difficulty: "medium"
  });
});
