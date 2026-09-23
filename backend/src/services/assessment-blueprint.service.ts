import { AssessmentBlueprintModel } from "../models/sih/SihModels";

export const ASSESSMENT_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type AssessmentDifficulty = (typeof ASSESSMENT_DIFFICULTIES)[number];

export type DifficultyDistribution = Record<AssessmentDifficulty, number>;

export type BlueprintCoverageRule = {
  competencyId: string;
  domain?: string;
  questionCount: number;
};

export type AssessmentBlueprintDefinition = {
  blueprintId: string;
  name: string;
  version: string;
  purpose: string;
  coverage: BlueprintCoverageRule[];
  questionCount: number;
  difficultyDistribution: DifficultyDistribution;
  questionType: "mcq";
  roleRelevance?: {
    jobRoles?: string[];
    departmentCodes?: string[];
    assignments?: string[];
  };
  experienceRelevance?: { minYears?: number; maxYears?: number };
  timeLimitMinutes?: number;
  active?: boolean;
  frameworkId?: string;
  frameworkVersionId?: string;
  frameworkVersion?: string;
  createdBy?: string;
  updatedBy?: string;
};

export type AssessmentQuestionForCoverage = {
  competencyId: string;
  difficulty: AssessmentDifficulty;
  questionType?: "mcq";
};

export class AssessmentBlueprintValidationError extends Error {
  statusCode = 400;
  code = "ASSESSMENT_BLUEPRINT_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "AssessmentBlueprintValidationError";
  }
}

function isNonNegativeInteger(value: number) {
  return Number.isInteger(value) && value >= 0;
}

export function validateAssessmentBlueprint(input: AssessmentBlueprintDefinition): AssessmentBlueprintDefinition {
  if (!input.blueprintId.trim() || !input.name.trim() || !input.version.trim() || !input.purpose.trim()) {
    throw new AssessmentBlueprintValidationError("Blueprint ID, name, version, and purpose are required.");
  }
  if (input.questionType !== "mcq") {
    throw new AssessmentBlueprintValidationError("Only MCQ assessment blueprints are supported in Phase 4B.1.");
  }
  if (!Number.isInteger(input.questionCount) || input.questionCount < 1) {
    throw new AssessmentBlueprintValidationError("Blueprint questionCount must be a positive integer.");
  }
  if (!input.coverage.length) {
    throw new AssessmentBlueprintValidationError("Blueprint coverage must include at least one competency.");
  }

  const ids = new Set<string>();
  const coverageTotal = input.coverage.reduce((total, rule) => {
    if (!rule.competencyId.trim() || ids.has(rule.competencyId)) {
      throw new AssessmentBlueprintValidationError("Blueprint coverage must contain unique competency IDs.");
    }
    ids.add(rule.competencyId);
    if (!Number.isInteger(rule.questionCount) || rule.questionCount < 1) {
      throw new AssessmentBlueprintValidationError(`Coverage for ${rule.competencyId} must have a positive question count.`);
    }
    return total + rule.questionCount;
  }, 0);

  if (coverageTotal !== input.questionCount) {
    throw new AssessmentBlueprintValidationError(
      `Blueprint coverage totals ${coverageTotal} questions, expected ${input.questionCount}.`
    );
  }

  const distributionTotal = ASSESSMENT_DIFFICULTIES.reduce((total, difficulty) => {
    const count = input.difficultyDistribution[difficulty];
    if (!isNonNegativeInteger(count)) {
      throw new AssessmentBlueprintValidationError(`Difficulty count for ${difficulty} must be a non-negative integer.`);
    }
    return total + count;
  }, 0);
  if (distributionTotal !== input.questionCount) {
    throw new AssessmentBlueprintValidationError(
      `Difficulty distribution totals ${distributionTotal} questions, expected ${input.questionCount}.`
    );
  }

  const minYears = input.experienceRelevance?.minYears;
  const maxYears = input.experienceRelevance?.maxYears;
  if (minYears != null && (minYears < 0 || !Number.isFinite(minYears))) {
    throw new AssessmentBlueprintValidationError("Minimum experience must be zero or greater.");
  }
  if (maxYears != null && (maxYears < 0 || !Number.isFinite(maxYears))) {
    throw new AssessmentBlueprintValidationError("Maximum experience must be zero or greater.");
  }
  if (minYears != null && maxYears != null && minYears > maxYears) {
    throw new AssessmentBlueprintValidationError("Minimum experience cannot exceed maximum experience.");
  }
  if (input.timeLimitMinutes != null && (!Number.isInteger(input.timeLimitMinutes) || input.timeLimitMinutes < 5 || input.timeLimitMinutes > 180)) {
    throw new AssessmentBlueprintValidationError("Blueprint timeLimitMinutes must be an integer between 5 and 180.");
  }

  return input;
}

export function validateAssessmentQuestionCoverage(
  questions: AssessmentQuestionForCoverage[],
  blueprint: AssessmentBlueprintDefinition
) {
  validateAssessmentBlueprint(blueprint);
  if (questions.length !== blueprint.questionCount) {
    throw new AssessmentBlueprintValidationError(
      `Generated ${questions.length} questions, expected ${blueprint.questionCount}.`
    );
  }

  const expectedCoverage = new Map(blueprint.coverage.map((rule) => [rule.competencyId, rule.questionCount]));
  const actualCoverage = new Map<string, number>();
  const actualDifficulty: DifficultyDistribution = { easy: 0, medium: 0, hard: 0 };
  for (const question of questions) {
    if (!expectedCoverage.has(question.competencyId)) {
      throw new AssessmentBlueprintValidationError(
        `Generated question belongs to competency ${question.competencyId}, which is not in the blueprint.`
      );
    }
    if (question.questionType && question.questionType !== blueprint.questionType) {
      throw new AssessmentBlueprintValidationError(`Generated question type ${question.questionType} is not supported by the blueprint.`);
    }
    actualCoverage.set(question.competencyId, (actualCoverage.get(question.competencyId) || 0) + 1);
    actualDifficulty[question.difficulty] += 1;
  }

  for (const [competencyId, expected] of expectedCoverage) {
    const actual = actualCoverage.get(competencyId) || 0;
    if (actual !== expected) {
      throw new AssessmentBlueprintValidationError(
        `Competency ${competencyId} has ${actual} generated questions, expected ${expected}.`
      );
    }
  }
  for (const difficulty of ASSESSMENT_DIFFICULTIES) {
    if (actualDifficulty[difficulty] !== blueprint.difficultyDistribution[difficulty]) {
      throw new AssessmentBlueprintValidationError(
        `Difficulty coverage for ${difficulty} is ${actualDifficulty[difficulty]}, expected ${blueprint.difficultyDistribution[difficulty]}.`
      );
    }
  }
  return { coverage: Object.fromEntries(actualCoverage), difficultyDistribution: actualDifficulty };
}

/** Deterministically assigns the global difficulty quota across competency slots. */
export function buildQuestionRequirements(blueprint: AssessmentBlueprintDefinition) {
  validateAssessmentBlueprint(blueprint);
  const remaining = { ...blueprint.difficultyDistribution };
  const slots = blueprint.coverage.flatMap((rule) =>
    Array.from({ length: rule.questionCount }, () => rule.competencyId)
  );
  const assigned = new Map<string, DifficultyDistribution>();
  for (const competencyId of blueprint.coverage.map((rule) => rule.competencyId)) {
    assigned.set(competencyId, { easy: 0, medium: 0, hard: 0 });
  }

  slots.forEach((competencyId) => {
    const difficulty = ASSESSMENT_DIFFICULTIES
      .filter((item) => remaining[item] > 0)
      .sort((a, b) => remaining[b] - remaining[a] || ASSESSMENT_DIFFICULTIES.indexOf(a) - ASSESSMENT_DIFFICULTIES.indexOf(b))[0];
    if (!difficulty) throw new AssessmentBlueprintValidationError("Unable to allocate blueprint difficulty requirements.");
    remaining[difficulty] -= 1;
    assigned.get(competencyId)![difficulty] += 1;
  });

  return blueprint.coverage.map((rule) => ({
    competencyId: rule.competencyId,
    questionCount: rule.questionCount,
    difficultyDistribution: assigned.get(rule.competencyId)!
  }));
}

export function buildFallbackAssessmentBlueprint(input: {
  competencyIds: string[];
  questionCountPerCompetency: number;
  frameworkId?: string;
  frameworkVersionId?: string;
  frameworkVersion?: string;
}): AssessmentBlueprintDefinition {
  const questionCount = input.competencyIds.length * input.questionCountPerCompetency;
  const easy = Math.floor(questionCount * 0.2);
  const hard = Math.floor(questionCount * 0.2);
  return validateAssessmentBlueprint({
    blueprintId: "aarambh-application-assessment-fallback",
    name: "ARAMBH Application-Defined Competency Assessment Fallback",
    version: "1.0",
    purpose: "Deterministic compatibility blueprint used when no configured assessment blueprint is selected.",
    coverage: input.competencyIds.map((competencyId) => ({ competencyId, questionCount: input.questionCountPerCompetency })),
    questionCount,
    difficultyDistribution: { easy, medium: questionCount - easy - hard, hard },
    questionType: "mcq",
    active: true,
    frameworkId: input.frameworkId,
    frameworkVersionId: input.frameworkVersionId,
    frameworkVersion: input.frameworkVersion
  });
}

export async function createAssessmentBlueprint(input: AssessmentBlueprintDefinition) {
  const blueprint = validateAssessmentBlueprint(input);
  return AssessmentBlueprintModel.create(blueprint);
}

export async function resolveAssessmentBlueprint(input: {
  blueprintId?: string;
  blueprintVersion?: string;
  fallback?: AssessmentBlueprintDefinition;
}) {
  if (!input.blueprintId) {
    if (!input.fallback) throw new AssessmentBlueprintValidationError("An assessment blueprint is required.");
    return { blueprint: input.fallback, source: "fallback" as const };
  }
  const query: Record<string, string | boolean> = { blueprintId: input.blueprintId, active: true };
  if (input.blueprintVersion) query.version = input.blueprintVersion;
  const stored = await AssessmentBlueprintModel.findOne(query).sort({ createdAt: -1 }).lean();
  if (!stored) throw new AssessmentBlueprintValidationError("No active assessment blueprint matches the requested blueprint ID/version.");
  const blueprint = validateAssessmentBlueprint({
    blueprintId: stored.blueprintId,
    name: stored.name,
    version: stored.version,
    purpose: stored.purpose,
    coverage: stored.coverage.map((rule) => ({ ...rule, competencyId: String(rule.competencyId) })),
    questionCount: stored.questionCount,
    questionType: "mcq",
    difficultyDistribution: {
      easy: stored.difficultyDistribution?.easy || 0,
      medium: stored.difficultyDistribution?.medium || 0,
      hard: stored.difficultyDistribution?.hard || 0
    },
    roleRelevance: stored.roleRelevance || undefined,
    experienceRelevance: stored.experienceRelevance
      ? {
          minYears: stored.experienceRelevance.minYears ?? undefined,
          maxYears: stored.experienceRelevance.maxYears ?? undefined
        }
      : undefined,
    timeLimitMinutes: stored.timeLimitMinutes ?? undefined,
    active: stored.active,
    frameworkId: stored.frameworkId || undefined,
    frameworkVersionId: stored.frameworkVersionId ? String(stored.frameworkVersionId) : undefined,
    frameworkVersion: stored.frameworkVersion || undefined,
    createdBy: stored.createdBy ? String(stored.createdBy) : undefined,
    updatedBy: stored.updatedBy ? String(stored.updatedBy) : undefined
  });
  return { blueprint, source: "configured" as const };
}
