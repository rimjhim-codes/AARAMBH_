import crypto from "crypto";
import { z } from "zod";
import { generateJsonWithFallback, generateWithFallback } from "./ai/provider";
import {
  FormalQuizAttemptModel,
  FormalQuizModel,
  SihQuestionModel
} from "../models/sih/SihModels";
import { applyQuizCompetencyImpact, recalculateSkillGaps } from "./competency.service";
import { generatePersonalizedLearningPath } from "./recommendation.service";
import { recalculatePerformance, recordLearningActivity } from "./performance.service";
import { recordLearningOutcome, stableLearningOutcomeSourceId } from "./learning-outcome.service";
import { processLearningOutcome } from "./learning-outcome-coordinator.service";
import type { DifficultyDistribution } from "./assessment-blueprint.service";
import { embedTexts } from "./ai/embedding.service";

export function deriveAttemptIntegrityFlags(input: {
  averageResponseTimeMs: number;
  suspiciousActivityCount?: number;
  suspiciousActivityReasons?: string[];
}) {
  const reasons = [...new Set(input.suspiciousActivityReasons || [])];
  if (input.averageResponseTimeMs > 0 && input.averageResponseTimeMs < 2000) {
    reasons.push("implausibly_low_average_response_time");
  }
  return {
    suspiciousActivityCount: Math.max(input.suspiciousActivityCount || 0, reasons.length),
    suspiciousActivityReasons: [...new Set(reasons)]
  };
}

export const McqSchema = z.object({
  question: z.string().trim().min(8),
  options: z.object({
    A: z.string().trim().min(1),
    B: z.string().trim().min(1),
    C: z.string().trim().min(1),
    D: z.string().trim().min(1)
  }).strict(),
  correctAnswer: z.enum(["A", "B", "C", "D"]),
  explanation: z.string().trim().min(3),
  difficulty: z.enum(["easy", "medium", "hard"]),
  topic: z.string().trim().min(1),
  sourceReference: z.string().optional(),
  sourcePageOrTimestamp: z.string().optional()
}).strict();

export type StructuredMcq = z.infer<typeof McqSchema>;

export function normalizeQuestionText(value: string) {
  return value
    .toLocaleLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizedQuestionKey(q: StructuredMcq) {
  return [q.question, q.options.A, q.options.B, q.options.C, q.options.D]
    .map(normalizeQuestionText)
    .join("|");
}

function contentHash(q: StructuredMcq) {
  return crypto
    .createHash("sha256")
    .update(`${q.question}|${q.options.A}|${q.options.B}|${q.options.C}|${q.options.D}`)
    .digest("hex");
}

function normalizedContentHash(q: StructuredMcq) {
  return crypto.createHash("sha256").update(normalizedQuestionKey(q)).digest("hex");
}

export type McqQualityResult = {
  valid: boolean;
  reasons: string[];
  qualityFlags: string[];
};

const PLACEHOLDER_OPTIONS = new Set(["", "n a", "na", "none", "null", "placeholder", "tbd", "unknown", "not sure"]);

function nearDuplicate(a: string, b: string) {
  const left = normalizeQuestionText(a);
  const right = normalizeQuestionText(b);
  if (left === right) return true;
  if (!left || !right) return false;
  return left.length >= 12 && right.length >= 12 && (left.includes(right) || right.includes(left));
}

export function validateMcqQuality(question: StructuredMcq): McqQualityResult {
  const reasons: string[] = [];
  const qualityFlags: string[] = [];
  const values = Object.values(question.options);
  const normalizedOptions = values.map(normalizeQuestionText);
  const questionText = normalizeQuestionText(question.question);

  if (questionText.length < 12 || questionText.split(" ").filter(Boolean).length < 3) {
    qualityFlags.push("question_too_short_or_meaningless");
  }
  if (!question.topic.trim()) reasons.push("missing_topic_or_competency_metadata");

  for (const option of normalizedOptions) {
    if (PLACEHOLDER_OPTIONS.has(option)) qualityFlags.push("placeholder_distractor");
    if (option.length >= 8 && (questionText.includes(option) || option.includes(questionText))) {
      qualityFlags.push("question_repeated_in_option");
    }
  }
  for (let i = 0; i < normalizedOptions.length; i += 1) {
    for (let j = i + 1; j < normalizedOptions.length; j += 1) {
      if (normalizedOptions[i] === normalizedOptions[j]) reasons.push("duplicate_option_values");
      else if (nearDuplicate(normalizedOptions[i], normalizedOptions[j])) qualityFlags.push("duplicate_or_near_identical_options");
    }
  }

  const lowerQuestion = questionText;
  if (normalizedOptions.some((option) => option === "all of the above" || option === "none of the above") ||
      lowerQuestion.includes("all of the above") || lowerQuestion.includes("none of the above")) {
    qualityFlags.push("compound_all_or_none_option");
  }
  if (!values.some((value) => value.trim())) reasons.push("empty_option_value");

  return {
    valid: reasons.length === 0,
    reasons: [...new Set(reasons)],
    qualityFlags: [...new Set(qualityFlags)]
  };
}

export class QuestionQualityValidationError extends Error {
  statusCode = 400;
  code = "QUESTION_QUALITY_VALIDATION_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "QuestionQualityValidationError";
  }
}

export type SemanticMcqValidation = {
  status: "passed" | "flagged" | "unavailable";
  reasons: string[];
  qualityFlags: string[];
  provider?: string;
};

type SemanticJsonGenerator = (
  input: { prompt: string; task: "mcq"; temperature?: number },
  parse: (raw: unknown) => unknown,
  userId?: string
) => Promise<{ data: unknown; provider: string }>;

const semanticResultSchema = z.array(z.object({
  valid: z.boolean(),
  reasons: z.array(z.string()).default([]),
  qualityFlags: z.array(z.string()).default([])
}));

export async function validateMcqSemantics(
  questions: StructuredMcq[],
  userId?: string,
  generateJson: SemanticJsonGenerator = generateJsonWithFallback as SemanticJsonGenerator
): Promise<SemanticMcqValidation[]> {
  if (!questions.length) return [];
  const prompt =
    "Review each MCQ deterministically for clarity, answer correctness, distractor validity, ambiguity, " +
    "topic relevance, and explanation consistency. Return JSON array in the same order. Do not provide hidden reasoning. " +
    'Each item must be {"valid":true|false,"reasons":["short reason"],"qualityFlags":["short flag"]}.\n' +
    `Questions:\n${JSON.stringify(questions)}`;
  try {
    const result = await generateJson(
      { prompt, task: "mcq", temperature: 0 },
      (raw) => semanticResultSchema.parse(raw),
      userId
    );
    const parsed = semanticResultSchema.safeParse(result.data);
    if (!parsed.success || parsed.data.length !== questions.length) throw new Error("Malformed semantic validation response");
    return parsed.data.map((item) => ({
      status: item.valid ? "passed" : "flagged",
      reasons: [...new Set(item.reasons)],
      qualityFlags: [...new Set(item.qualityFlags)],
      provider: result.provider
    }));
  } catch {
    return questions.map(() => ({
      status: "unavailable" as const,
      reasons: ["semantic_validation_unavailable"],
      qualityFlags: ["semantic_validation_required_before_publication"]
    }));
  }
}

export type SemanticDuplicateResult = {
  available: boolean;
  duplicatePairs: Array<[number, number]>;
  reason?: string;
};

function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftNorm += left[index] ** 2;
    rightNorm += right[index] ** 2;
  }
  return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
}

export async function detectSemanticDuplicateMcqs(
  questions: StructuredMcq[],
  embedder: (texts: string[]) => Promise<number[][]> = embedTexts
): Promise<SemanticDuplicateResult> {
  if (questions.length < 2) return { available: true, duplicatePairs: [] };
  try {
    const vectors = await embedder(questions.map((item) =>
      `${item.question}\nOptions: ${Object.values(item.options).join(" | ")}\nTopic: ${item.topic}`
    ));
    if (vectors.length !== questions.length || vectors.some((vector) => !vector.length)) {
      return { available: false, duplicatePairs: [], reason: "embedding_response_invalid" };
    }
    const duplicatePairs: Array<[number, number]> = [];
    for (let left = 0; left < vectors.length; left += 1) {
      for (let right = left + 1; right < vectors.length; right += 1) {
        if (cosineSimilarity(vectors[left], vectors[right]) >= 0.92) duplicatePairs.push([left, right]);
      }
    }
    return { available: true, duplicatePairs };
  } catch {
    return { available: false, duplicatePairs: [], reason: "embedding_provider_unavailable" };
  }
}

export type QuestionAnalytics = {
  questionId: string;
  attempts: number;
  correctCount: number;
  incorrectCount: number;
  skippedCount: number;
  accuracy: number | null;
  skipRate: number | null;
  averageResponseTimeMs: number | null;
  difficulty?: string;
};

export function calculateQuestionAnalytics(
  questionId: string,
  attempts: Array<{ answers?: Array<{ questionId?: unknown; selected?: string; correct?: boolean; responseTimeMs?: number }>; }>,
  difficulty?: string
): QuestionAnalytics {
  let attemptsCount = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let skippedCount = 0;
  let responseTotal = 0;
  let responseCount = 0;
  for (const attempt of attempts) {
    const answer = (attempt.answers || []).find((item) => String(item.questionId) === questionId);
    if (!answer) continue;
    attemptsCount += 1;
    if (!answer.selected) skippedCount += 1;
    else if (answer.correct) correctCount += 1;
    else incorrectCount += 1;
    if (typeof answer.responseTimeMs === "number" && answer.responseTimeMs >= 0) {
      responseTotal += answer.responseTimeMs;
      responseCount += 1;
    }
  }
  return {
    questionId,
    attempts: attemptsCount,
    correctCount,
    incorrectCount,
    skippedCount,
    accuracy: attemptsCount ? Math.round((correctCount / attemptsCount) * 100) : null,
    skipRate: attemptsCount ? Math.round((skippedCount / attemptsCount) * 100) : null,
    averageResponseTimeMs: responseCount ? Math.round(responseTotal / responseCount) : null,
    difficulty
  };
}

export function validateGeneratedMcqs(questions: StructuredMcq[]) {
  if (!questions.length) throw new QuestionQualityValidationError("No assessment questions were generated.");
  const seen = new Set<string>();
  const results = questions.map((question, index) => {
    const parsed = McqSchema.safeParse(question);
    if (!parsed.success) {
      throw new QuestionQualityValidationError(`Generated question ${index + 1} failed structural validation.`);
    }
    const key = normalizedQuestionKey(parsed.data);
    if (seen.has(key)) {
      throw new QuestionQualityValidationError(`Generated question ${index + 1} duplicates another question in this assessment.`);
    }
    seen.add(key);
    return validateMcqQuality(parsed.data);
  });
  return results;
}

function normalizeAiMcq(raw: unknown): StructuredMcq | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const allowedFields = new Set([
    "question", "options", "correctAnswer", "explanation", "difficulty", "topic", "sourceReference", "sourcePageOrTimestamp"
  ]);
  if (Object.keys(o).some((key) => !allowedFields.has(key))) return null;

  let options = o.options;
  if (Array.isArray(options) && options.length >= 4) {
    options = {
      A: String(options[0]),
      B: String(options[1]),
      C: String(options[2]),
      D: String(options[3])
    };
  }

  const correctAnswer = typeof o.correctAnswer === "string" ? o.correctAnswer.trim() : "";

  const parsed = McqSchema.safeParse({
    question: o.question,
    options,
    correctAnswer,
    explanation: o.explanation,
    difficulty: o.difficulty,
    topic: o.topic,
    sourceReference: o.sourceReference,
    sourcePageOrTimestamp: o.sourcePageOrTimestamp
  });
  return parsed.success ? parsed.data : null;
}

export async function generateStructuredMcqsFromContent(input: {
  content: string;
  count: number;
  difficulty?: "easy" | "medium" | "hard";
  topic?: string;
  competencyName?: string;
  language?: string;
  userId?: string;
}): Promise<{ questions: StructuredMcq[]; provider: string }> {
  const difficulty = input.difficulty || "medium";
  const count = Math.max(1, Math.min(20, input.count));

  const prompt =
    `Generate exactly ${count} multiple-choice questions from the learning material ONLY.\n` +
    `Difficulty: ${difficulty}. Language: ${input.language || "English"}.\n` +
    `Topic focus: ${input.topic || "general"}. Competency: ${input.competencyName || "general"}.\n` +
    "Return VALID JSON array ONLY (no markdown). Each item:\n" +
    '{"question":"","options":{"A":"","B":"","C":"","D":""},"correctAnswer":"A|B|C|D","explanation":"","difficulty":"easy|medium|hard","topic":"","sourceReference":"","sourcePageOrTimestamp":""}\n' +
    "Rules: 4 distinct options; exactly one correct; no hallucinations; grounded in material.\n\n" +
    `Material:\n${input.content.slice(0, 24000)}`;

  const { data, provider } = await generateJsonWithFallback(
    { prompt, task: "mcq", temperature: 0.2 },
    (raw) => {
      if (!Array.isArray(raw)) throw new Error("Expected JSON array");
      return raw;
    },
    input.userId
  );

  const questions = data.map(normalizeAiMcq);
  if (questions.some((question) => !question)) throw new QuestionQualityValidationError("AI returned one or more structurally invalid MCQs.");
  const validQuestions = questions as StructuredMcq[];
  validateGeneratedMcqs(validQuestions);

  return { questions: validQuestions, provider };
}

export async function persistGeneratedQuestions(input: {
  questions: StructuredMcq[];
  createdBy: string;
  lectureId?: string;
  competencyId?: string;
  status?: "draft" | "pending_review" | "approved" | "published";
  language?: string;
  runSemanticValidation?: boolean;
}) {
  if (input.status && !["draft", "pending_review"].includes(input.status)) {
    throw new QuestionQualityValidationError("AI-generated questions must remain pending review until an authorized reviewer approves them.");
  }
  const quality = validateGeneratedMcqs(input.questions);
  const semantic: SemanticMcqValidation[] = input.runSemanticValidation
    ? await validateMcqSemantics(input.questions, input.createdBy)
    : input.questions.map(() => ({ status: "passed" as const, reasons: [], qualityFlags: [], provider: "" }));
  const semanticDuplicates = input.runSemanticValidation
    ? await detectSemanticDuplicateMcqs(input.questions)
    : { available: true, duplicatePairs: [] as Array<[number, number]> };
  const hashes = input.questions.map((q) => ({
    contentHash: contentHash(q),
    normalizedContentHash: normalizedContentHash(q)
  }));
  const existing = await SihQuestionModel.find({
    createdBy: input.createdBy,
    $or: [
      { contentHash: { $in: hashes.map((hash) => hash.contentHash) } },
      { normalizedContentHash: { $in: hashes.map((hash) => hash.normalizedContentHash) } }
    ]
  }).select("contentHash normalizedContentHash").lean();
  const existingHashes = new Set(existing.flatMap((question) => [question.contentHash, question.normalizedContentHash].filter(Boolean)));
  const saved = [];
  for (const [index, q] of input.questions.entries()) {
    const hash = hashes[index];
    if (existingHashes.has(hash.contentHash) || existingHashes.has(hash.normalizedContentHash)) continue;
    const qualityResult = quality[index];
    const semanticResult = semantic[index];
    const duplicateFlags = semanticDuplicates.duplicatePairs
      .filter(([left, right]) => left === index || right === index)
      .map(([left, right]) => `semantic_duplicate_with_${left === index ? right + 1 : left + 1}`);
    const qualityFlags = [...new Set([
      ...qualityResult.qualityFlags,
      ...semanticResult.qualityFlags,
      ...duplicateFlags,
      ...(semanticDuplicates.available ? [] : ["semantic_duplicate_check_unavailable"])
    ])];

    const doc = await SihQuestionModel.create({
      lectureId: input.lectureId,
      competencyId: input.competencyId,
      createdBy: input.createdBy,
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      explanation: q.explanation,
      difficulty: q.difficulty,
      topic: q.topic,
      sourceReference: q.sourceReference || "",
      sourcePageOrTimestamp: q.sourcePageOrTimestamp || "",
      status: input.status || "pending_review",
      contentHash: hash.contentHash,
      normalizedContentHash: hash.normalizedContentHash,
      validationStatus: qualityResult.valid ? "passed" : "failed",
      validationReasons: qualityResult.reasons,
      qualityFlags,
      semanticValidationStatus: semanticResult.status,
      semanticValidationReasons: semanticResult.reasons,
      semanticValidationProvider: semanticResult.provider || "",
      semanticValidatedAt: semanticResult.status === "unavailable" ? undefined : new Date(),
      language: input.language || "English"
    });
    saved.push(doc);
  }
  return saved;
}

export async function createQuizFromQuestions(input: {
  title: string;
  createdBy: string;
  questionIds: string[];
  lectureId?: string;
  competencyIds?: string[];
  topic?: string;
  difficulty?: "easy" | "medium" | "hard" | "mixed";
  passingPercentage?: number;
  timeLimitMinutes?: number;
  negativeMarking?: boolean;
  randomize?: boolean;
  adaptive?: boolean;
  status?: "draft" | "published";
  assignedTo?: string[];
  finalizationKey?: string;
  timeLimitEnabled?: boolean;
  blueprintId?: string;
  blueprintVersion?: string;
  questionMetadata?: Array<{ questionId: string; competencyId: string; domain?: string }>;
}) {
  return FormalQuizModel.create({
    title: input.title,
    createdBy: input.createdBy,
    questionIds: input.questionIds,
    lectureId: input.lectureId,
    competencyIds: input.competencyIds || [],
    topic: input.topic || "",
    difficulty: input.difficulty || "mixed",
    passingPercentage: input.passingPercentage ?? 60,
    timeLimitMinutes: input.timeLimitMinutes ?? 30,
    negativeMarking: input.negativeMarking ?? false,
    randomize: input.randomize ?? true,
    adaptive: input.adaptive ?? false,
    status: input.status || "draft",
    assignedTo: input.assignedTo || [],
    finalizationKey: input.finalizationKey,
    timeLimitEnabled: input.timeLimitEnabled ?? Boolean(input.timeLimitMinutes),
    blueprintId: input.blueprintId || "",
    blueprintVersion: input.blueprintVersion || "",
    questionMetadata: input.questionMetadata || []
  });
}

export async function evaluateQuizAttempt(input: {
  quizId: string;
  userId: string;
  answers: Array<{ questionId: string; selected: "A" | "B" | "C" | "D" | ""; responseTimeMs?: number }>;
  suspiciousActivityCount?: number;
  suspiciousActivityReasons?: string[];
  /** Competency assessments emit their own assessment.completed outcome. */
  recordLearningOutcome?: boolean;
  applyCompetencyImpact?: boolean;
  runLegacyDownstream?: boolean;
}) {
  const quiz = await FormalQuizModel.findById(input.quizId);
  if (!quiz) throw new Error("Quiz not found");
  if (quiz.status !== "published" && String(quiz.createdBy) !== input.userId) {
    throw new Error("Quiz is not published");
  }

  const questions = await SihQuestionModel.find({ _id: { $in: quiz.questionIds } });
  const byId = new Map(questions.map((q) => [String(q._id), q]));

  let correctCount = 0;
  let incorrectCount = 0;
  let skippedCount = 0;
  const graded: Array<{
    questionId: string;
    selected: "A" | "B" | "C" | "D" | "";
    correct: boolean;
    responseTimeMs?: number;
  }> = [];
  const weakTopics: string[] = [];
  let responseTimeSum = 0;
  let responseTimeN = 0;

  for (const qid of quiz.questionIds.map(String)) {
    const q = byId.get(qid);
    const ans = input.answers.find((a) => a.questionId === qid);
    const selected = (ans?.selected || "") as "A" | "B" | "C" | "D" | "";
    if (!q) continue;
    if (!selected) {
      skippedCount += 1;
      graded.push({ questionId: qid, selected: "", correct: false, responseTimeMs: ans?.responseTimeMs });
      if (q.topic) weakTopics.push(q.topic);
      continue;
    }
    const isCorrect = selected === q.correctAnswer;
    if (isCorrect) correctCount += 1;
    else {
      incorrectCount += 1;
      if (q.topic) weakTopics.push(q.topic);
    }
    if (ans?.responseTimeMs) {
      responseTimeSum += ans.responseTimeMs;
      responseTimeN += 1;
    }
    graded.push({
      questionId: qid,
      selected,
      correct: isCorrect,
      responseTimeMs: ans?.responseTimeMs
    });
  }

  const total = questions.length || quiz.questionIds.length;
  let score = correctCount;
  if (quiz.negativeMarking) {
    score = Math.max(0, correctCount - incorrectCount * 0.25);
  }
  const percentage = total ? Math.round((correctCount / total) * 100) : 0;
  const passed = percentage >= (quiz.passingPercentage || 60);
  const averageResponseTimeMs = responseTimeN ? Math.round(responseTimeSum / responseTimeN) : 0;
  const integrity = deriveAttemptIntegrityFlags({
    averageResponseTimeMs,
    suspiciousActivityCount: input.suspiciousActivityCount,
    suspiciousActivityReasons: input.suspiciousActivityReasons
  });

  const sourceEventId = stableLearningOutcomeSourceId({
    quizId: String(quiz._id),
    answers: input.answers
      .map(({ questionId, selected }) => ({ questionId, selected }))
      .sort((a, b) => a.questionId.localeCompare(b.questionId))
  });
  const outcomeDedupeKey = stableLearningOutcomeSourceId({
    userId: input.userId,
    eventType: "quiz.completed",
    resourceType: "quiz",
    resourceId: String(quiz._id),
    source: "arambh",
    sourceEventId
  });

  // Formal quiz retries are deduplicated before competency impact is applied.
  // Competency-assessment attempts intentionally retain their locked legacy
  // ordering and use the assessment completion boundary below instead.
  if (input.recordLearningOutcome !== false) {
    const existingAttempt = await FormalQuizAttemptModel.findOne({ outcomeDedupeKey }).lean();
    if (existingAttempt) {
      const existingAnswers = (existingAttempt.answers || []) as any[];
      return {
        attempt: existingAttempt,
        review: questions.map((q) => ({
          id: q.id,
          question: q.question,
          options: q.options,
          correctAnswer: q.correctAnswer,
          explanation: q.explanation,
          topic: q.topic,
          selected: existingAnswers.find((answer) => String(answer.questionId) === String(q._id))?.selected || "",
          isCorrect: Boolean(existingAnswers.find((answer) => String(answer.questionId) === String(q._id))?.correct)
        })),
        quiz
      };
    }
  }

  let attempt: any;
  if (input.recordLearningOutcome !== false) {
    try {
      attempt = await FormalQuizAttemptModel.create({
        quizId: quiz.id,
        userId: input.userId,
        outcomeDedupeKey,
        answers: graded,
        score,
        total,
        percentage,
        correctCount,
        incorrectCount,
        skippedCount,
        passed,
        averageResponseTimeMs,
        suspiciousActivityCount: integrity.suspiciousActivityCount,
        suspiciousActivityReasons: integrity.suspiciousActivityReasons,
        weakTopics: [...new Set(weakTopics)],
        competencyImpacts: []
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      const existingAttempt = await FormalQuizAttemptModel.findOne({ outcomeDedupeKey }).lean();
      if (!existingAttempt) throw error;
      return { attempt: existingAttempt, review: [], quiz };
    }
  }

  const competencyImpacts = [];
  const applyLegacyCompetencyImpact = input.applyCompetencyImpact === true || input.recordLearningOutcome === false;
  if (applyLegacyCompetencyImpact) {
    for (const cid of quiz.competencyIds || []) {
      const updated = await applyQuizCompetencyImpact({
        userId: input.userId,
        competencyId: String(cid),
        percentage,
        topic: quiz.topic || quiz.title
      });
      competencyImpacts.push({ competencyId: cid, delta: updated.currentLevel });
    }
  }

  if (input.recordLearningOutcome !== false) {
    attempt = await FormalQuizAttemptModel.findByIdAndUpdate(
      attempt._id,
      { competencyImpacts },
      { new: true }
    );
  } else {
    attempt = await FormalQuizAttemptModel.create({
    quizId: quiz.id,
    userId: input.userId,
    answers: graded,
    score,
    total,
    percentage,
    correctCount,
    incorrectCount,
    skippedCount,
    passed,
    averageResponseTimeMs,
    suspiciousActivityCount: integrity.suspiciousActivityCount,
    suspiciousActivityReasons: integrity.suspiciousActivityReasons,
    weakTopics: [...new Set(weakTopics)],
    competencyImpacts
    });
  }

  if (input.recordLearningOutcome !== false) {
    const outcome = await recordLearningOutcome({
      userId: input.userId,
      eventType: "quiz.completed",
      resourceType: "quiz",
      resourceId: String(quiz._id),
      source: "arambh",
      sourceEventId,
      occurredAt: new Date(),
      progressPercent: 100,
      outcomeScore: percentage,
      competencyIds: (quiz.competencyIds || []).map(String),
      metadata: { attemptId: String(attempt._id), passed }
    });
    await processLearningOutcome(outcome.eventId);
  }

  await recordLearningActivity({
    userId: input.userId,
    type: "quiz",
    minutes: quiz.timeLimitMinutes ? Math.min(quiz.timeLimitMinutes, 30) : 15,
    meta: { quizId: quiz.id, percentage, passed }
  });

  if (input.recordLearningOutcome === false && input.runLegacyDownstream !== false) {
    await recalculateSkillGaps(input.userId);
    await generatePersonalizedLearningPath(input.userId);
    await recalculatePerformance(input.userId);
  }

  const review = questions.map((q) => ({
    id: q.id,
    question: q.question,
    options: q.options,
    correctAnswer: q.correctAnswer,
    explanation: q.explanation,
    topic: q.topic,
    selected: graded.find((g) => g.questionId === String(q._id))?.selected || "",
    isCorrect: graded.find((g) => g.questionId === String(q._id))?.correct || false
  }));

  return { attempt, review, quiz };
}

export async function generateCompetencyAssessmentQuestions(input: {
  competencyName: string;
  difficulty?: "easy" | "medium" | "hard";
  difficultyDistribution?: DifficultyDistribution;
  count: number;
  jobRole?: string;
  experienceYears?: number;
  userId?: string;
}) {
  const difficulty = input.difficulty || "medium";
  const distribution = input.difficultyDistribution || { easy: 0, medium: input.count, hard: 0 };
  const distributionText = Object.entries(distribution)
    .filter(([, count]) => count > 0)
    .map(([level, count]) => `${count} ${level}`)
    .join(", ");
  const prompt =
    `Create ${input.count} MCQs to assess competency "${input.competencyName}" for India's Official Statistical System.\n` +
    `Learner job role: ${input.jobRole || "Statistical Officer"}. Experience: ${input.experienceYears || 0} years.\n` +
    `Difficulty distribution: ${distributionText || difficulty}. Generate exactly these counts by difficulty.\n` +
    "Return VALID JSON array ONLY with schema:\n" +
    '{"question":"","options":{"A":"","B":"","C":"","D":""},"correctAnswer":"A|B|C|D","explanation":"","difficulty":"easy|medium|hard","topic":"","sourceReference":"competency-framework","sourcePageOrTimestamp":""}\n';

  const { data, provider } = await generateJsonWithFallback(
    { prompt, task: "mcq", temperature: 0.25 },
    (raw) => {
      if (!Array.isArray(raw)) throw new Error("Expected array");
      return raw;
    },
    input.userId
  );

  const questions = data.map(normalizeAiMcq).filter(Boolean) as StructuredMcq[];
  if (!questions.length) throw new Error("No valid assessment questions generated");
  return { questions, provider };
}

export async function adaptiveDifficulty(
  recentPercentages: number[]
): Promise<"easy" | "medium" | "hard"> {
  if (!recentPercentages.length) return "medium";
  const avg = recentPercentages.reduce((a, b) => a + b, 0) / recentPercentages.length;
  if (avg >= 80) return "hard";
  if (avg < 50) return "easy";
  return "medium";
}

export async function aiFeedbackOnAttempt(input: {
  percentage: number;
  weakTopics: string[];
  competencyName?: string;
  userId?: string;
}) {
  try {
    const { text, provider } = await generateWithFallback({
      task: "feedback",
      temperature: 0.3,
      prompt:
        "Provide concise personalized feedback for a government statistics learner.\n" +
        `Score: ${input.percentage}%\nWeak topics: ${input.weakTopics.join(", ") || "none"}\n` +
        `Competency: ${input.competencyName || "general"}\n` +
        "Include: what went well, what to revise, next recommended action. No fake course enrollments."
    }, input.userId);
    return { feedback: text, provider };
  } catch (e) {
    return {
      feedback: `Score ${input.percentage}%. Revise: ${input.weakTopics.join(", ") || "general fundamentals"}.`,
      provider: "none",
      error: (e as Error).message
    };
  }
}
