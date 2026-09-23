import crypto from "crypto";
import mongoose from "mongoose";
import {
  CompetencyAssessmentModel,
  FormalQuizModel,
  SihQuestionModel
} from "../models/sih/SihModels";
import {
  type AssessmentBlueprintDefinition,
  AssessmentBlueprintValidationError,
  resolveAssessmentBlueprint,
  validateAssessmentBlueprint,
  validateAssessmentQuestionCoverage
} from "./assessment-blueprint.service";
import {
  McqSchema,
  createQuizFromQuestions,
  normalizedQuestionKey,
  validateMcqQuality,
  type StructuredMcq
} from "./quiz-engine.service";

export class CompetencyAssessmentFinalizationError extends Error {
  statusCode = 400;
  code = "COMPETENCY_ASSESSMENT_FINALIZATION_FAILED";

  constructor(message: string) {
    super(message);
    this.name = "CompetencyAssessmentFinalizationError";
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === 11000);
}

type FinalizableQuestion = {
  _id: unknown;
  competencyId?: unknown;
  question: string;
  options: { A: string; B: string; C: string; D: string };
  correctAnswer: string;
  explanation: string;
  difficulty: "easy" | "medium" | "hard";
  topic: string;
  sourceReference?: string;
  sourcePageOrTimestamp?: string;
  status: string;
  validationStatus?: string;
  semanticValidationStatus?: string;
};

export function canFinalizeCompetencyAssessment(user: { role?: string } | undefined) {
  return user?.role === "admin" || user?.role === "faculty";
}

export function finalizationKey(input: {
  assessmentId: string;
  blueprintId: string;
  blueprintVersion: string;
  questionIds: string[];
}) {
  return crypto.createHash("sha256")
    .update([
      input.assessmentId,
      input.blueprintId,
      input.blueprintVersion,
      [...input.questionIds].sort().join(",")
    ].join("|"))
    .digest("hex");
}

function blueprintSnapshot(assessment: any): AssessmentBlueprintDefinition {
  const coverage = (assessment.blueprintCoverage || []).map((rule: any) => ({
    competencyId: String(rule.competencyId),
    domain: rule.domain || "",
    questionCount: rule.questionCount
  }));
  return validateAssessmentBlueprint({
    blueprintId: assessment.blueprintId,
    name: "ARAMBH Application-Defined Competency Assessment Blueprint",
    version: assessment.blueprintVersion,
    purpose: "Application-defined blueprint captured when the assessment entered review.",
    coverage,
    questionCount: assessment.questionIds.length,
    difficultyDistribution: {
      easy: assessment.difficultyDistribution?.easy || 0,
      medium: assessment.difficultyDistribution?.medium || 0,
      hard: assessment.difficultyDistribution?.hard || 0
    },
    timeLimitMinutes: assessment.timeLimitMinutes,
    questionType: "mcq",
    active: true
  });
}

export function validateFinalizableQuestionSet(
  questions: FinalizableQuestion[],
  blueprint: AssessmentBlueprintDefinition
) {
  const seen = new Set<string>();
  const coverageRows: Array<{ competencyId: string; difficulty: "easy" | "medium" | "hard"; questionType: "mcq" }> = [];
  const metadata: Array<{ questionId: string; competencyId: string; domain: string }> = [];
  const domains = new Map(blueprint.coverage.map((rule) => [rule.competencyId, rule.domain || ""]));

  for (const question of questions) {
    const id = String(question._id);
    if (seen.has(id)) throw new CompetencyAssessmentFinalizationError("The final assessment contains a duplicate question ID.");
    seen.add(id);
    if (question.status === "rejected" || question.status === "pending_review") {
      throw new CompetencyAssessmentFinalizationError(`Question ${id} cannot be used while it is ${question.status}.`);
    }
    if (!["approved", "published"].includes(question.status)) {
      throw new CompetencyAssessmentFinalizationError(`Question ${id} is not approved for assessment use.`);
    }
    if (question.validationStatus === "failed") {
      throw new CompetencyAssessmentFinalizationError(`Question ${id} failed quality validation.`);
    }
    if (question.semanticValidationStatus === "unavailable") {
      throw new CompetencyAssessmentFinalizationError(`Question ${id} cannot be finalized while semantic validation is unavailable.`);
    }
    const parsed = McqSchema.safeParse({
      question: question.question,
      options: question.options,
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
      difficulty: question.difficulty,
      topic: question.topic,
      sourceReference: question.sourceReference || "",
      sourcePageOrTimestamp: question.sourcePageOrTimestamp || ""
    });
    if (!parsed.success) throw new CompetencyAssessmentFinalizationError(`Question ${id} failed structural validation.`);
    const quality = validateMcqQuality(parsed.data);
    if (!quality.valid) throw new CompetencyAssessmentFinalizationError(`Question ${id} failed deterministic quality validation.`);
    const key = normalizedQuestionKey(parsed.data);
    if (seen.has(`content:${key}`)) throw new CompetencyAssessmentFinalizationError(`Question ${id} duplicates another final assessment question.`);
    seen.add(`content:${key}`);

    const competencyId = question.competencyId ? String(question.competencyId) : "";
    if (!competencyId || !domains.has(competencyId)) {
      throw new CompetencyAssessmentFinalizationError(`Question ${id} is outside the assessment blueprint competencies.`);
    }
    coverageRows.push({ competencyId, difficulty: question.difficulty, questionType: "mcq" });
    metadata.push({ questionId: id, competencyId, domain: domains.get(competencyId) || "" });
  }

  validateAssessmentQuestionCoverage(coverageRows, blueprint);
  return { metadata };
}

export async function finalizeCompetencyAssessment(input: {
  assessmentId: string;
  finalizedBy: string;
}) {
  if (!mongoose.isValidObjectId(input.assessmentId)) {
    throw new CompetencyAssessmentFinalizationError("Invalid competency assessment ID.");
  }

  const assessment = await CompetencyAssessmentModel.findById(input.assessmentId).lean();
  if (!assessment) throw new CompetencyAssessmentFinalizationError("Competency assessment not found.");

  if (assessment.status !== "pending_review") {
    if (assessment.quizId) {
      const quiz = await FormalQuizModel.findById(assessment.quizId).lean();
      return { assessment, quiz, reused: true };
    }
    throw new CompetencyAssessmentFinalizationError("This assessment is not awaiting question review.");
  }
  if (!assessment.blueprintId || !assessment.blueprintVersion) {
    throw new CompetencyAssessmentFinalizationError("The pending assessment has no valid blueprint reference.");
  }

  const questionIds = (assessment.questionIds || []).map(String);
  if (!questionIds.length) throw new CompetencyAssessmentFinalizationError("The assessment has no questions to finalize.");
  if (new Set(questionIds).size !== questionIds.length) {
    throw new CompetencyAssessmentFinalizationError("The assessment question set contains duplicate IDs.");
  }
  const questions = await SihQuestionModel.find({ _id: { $in: questionIds } }).lean() as unknown as FinalizableQuestion[];
  if (questions.length !== questionIds.length) {
    throw new CompetencyAssessmentFinalizationError("One or more required assessment questions are missing.");
  }

  let blueprint: AssessmentBlueprintDefinition;
  let blueprintSource: "configured" | "fallback" = assessment.blueprintSource === "configured" ? "configured" : "fallback";
  if (blueprintSource === "configured") {
    const resolved = await resolveAssessmentBlueprint({
      blueprintId: assessment.blueprintId,
      blueprintVersion: assessment.blueprintVersion
    });
    blueprint = resolved.blueprint;
  } else {
    blueprint = blueprintSnapshot(assessment);
  }
  if (blueprint.blueprintId !== assessment.blueprintId || blueprint.version !== assessment.blueprintVersion) {
    throw new CompetencyAssessmentFinalizationError("Assessment blueprint metadata does not match the pending assessment.");
  }

  const { metadata } = validateFinalizableQuestionSet(questions, blueprint);
  const key = finalizationKey({
    assessmentId: String(assessment._id),
    blueprintId: blueprint.blueprintId,
    blueprintVersion: blueprint.version,
    questionIds
  });
  const alreadyFinalized = await CompetencyAssessmentModel.findOne({ finalizationKey: key }).lean();
  if (alreadyFinalized?.quizId) {
    const quiz = await FormalQuizModel.findById(alreadyFinalized.quizId).lean();
    return { assessment: alreadyFinalized, quiz, reused: true };
  }

  const competencyIds = [...new Set(metadata.map((item) => item.competencyId))];
  let quiz;
  let createdQuiz = false;
  try {
    quiz = await createQuizFromQuestions({
      title: "Reviewed Competency Assessment",
      createdBy: input.finalizedBy,
      questionIds,
      competencyIds,
      topic: "competency-assessment",
      difficulty: "mixed",
      passingPercentage: 60,
      timeLimitMinutes: blueprint.timeLimitMinutes || Math.max(15, questionIds.length * 2),
      timeLimitEnabled: blueprint.timeLimitMinutes != null,
      status: "published",
      assignedTo: [String(assessment.userId)],
      finalizationKey: key,
      blueprintId: blueprint.blueprintId,
      blueprintVersion: blueprint.version,
      questionMetadata: metadata
    });
    createdQuiz = true;
  } catch (error) {
    if (!isDuplicateKeyError(error)) throw error;
    // Another request won the unique finalization-key race. Reuse its quiz and
    // let the conditional assessment update below converge both callers.
    quiz = await FormalQuizModel.findOne({ finalizationKey: key }).lean();
    if (!quiz) throw new CompetencyAssessmentFinalizationError("Concurrent assessment finalization could not be recovered safely.");
  }

  const finalized = await CompetencyAssessmentModel.findOneAndUpdate(
    { _id: assessment._id, status: "pending_review" },
    {
      status: "in_progress",
      quizId: quiz._id,
      finalizationKey: key,
      blueprintId: blueprint.blueprintId,
      blueprintVersion: blueprint.version,
      blueprintSource
    },
    { new: true }
  ).lean();
  if (!finalized) {
    const existing = await CompetencyAssessmentModel.findById(assessment._id).lean();
    if (existing?.quizId) {
      return { assessment: existing, quiz: await FormalQuizModel.findById(existing.quizId).lean(), reused: true };
    }
    if (createdQuiz) {
      await FormalQuizModel.deleteOne({ _id: quiz._id, finalizationKey: key });
    }
    throw new CompetencyAssessmentFinalizationError("Assessment finalization could not be completed safely.");
  }
  return { assessment: finalized, quiz, reused: false };
}
