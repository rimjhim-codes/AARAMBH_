import { Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../../middleware/auth";
import { languageName } from "../../config/languages";
import {
  CompetencyAssessmentModel,
  CompetencyModel,
  CompetencyScoreModel,
  EmployeeProfileModel,
  FormalQuizModel,
  RoleRequirementModel,
  SkillGapModel
} from "../../models/sih/SihModels";
import {
  bootstrapCompetencyScoresFromProfile,
  confidenceFromEvidence,
  levelFromAssessmentAccuracy,
  recalculateSkillGaps,
  requirementsForCareerRole,
  summarizeEvidence,
  updateCompetencyFromAssessment
} from "../../services/competency.service";
import {
  generateCompetencyAssessmentQuestions,
  persistGeneratedQuestions,
  type StructuredMcq
} from "../../services/quiz-engine.service";
import { generatePersonalizedLearningPath } from "../../services/recommendation.service";
import { recalculatePerformance } from "../../services/performance.service";
import { recordLearningOutcome } from "../../services/learning-outcome.service";
import { processLearningOutcome } from "../../services/learning-outcome-coordinator.service";
import {
  buildFallbackAssessmentBlueprint,
  buildQuestionRequirements,
  resolveAssessmentBlueprint,
  validateAssessmentQuestionCoverage
} from "../../services/assessment-blueprint.service";
import {
  canFinalizeCompetencyAssessment,
  finalizeCompetencyAssessment
} from "../../services/competency-assessment-finalization.service";
import { NotificationModel } from "../../models/Notification";
import { UserModel } from "../../models/User";

export async function listCompetencies(_req: AuthenticatedRequest, res: Response) {
  const items = await CompetencyModel.find({ isActive: true }).sort({ category: 1, name: 1 });
  return res.json({ competencies: items });
}

export async function getMyCompetencyProfile(req: AuthenticatedRequest, res: Response) {
  let scores = await CompetencyScoreModel.find({ userId: req.user!.id })
    .populate("competencyId")
    .lean();

  if (!scores.length) {
    const profile = await EmployeeProfileModel.findOne({ userId: req.user!.id });
    if (profile) {
      await bootstrapCompetencyScoresFromProfile(req.user!.id);
      scores = await CompetencyScoreModel.find({ userId: req.user!.id }).populate("competencyId").lean();
    }
  }

  return res.json({
    scores: scores.map((score: any) => ({
      ...score,
      confidence: score.confidence || confidenceFromEvidence(score.evidence || []),
      evidenceSummary: summarizeEvidence(score.evidence || [])
    })),
    empty: scores.length === 0,
    message:
      scores.length === 0
        ? "No competency evidence yet. Complete your profile or take an assessment."
        : undefined
  });
}

export async function getMySkillGaps(req: AuthenticatedRequest, res: Response) {
  const hasScores = await CompetencyScoreModel.findOne({ userId: req.user!.id }).select("_id").lean();
  if (!hasScores) await bootstrapCompetencyScoresFromProfile(req.user!.id);
  await recalculateSkillGaps(req.user!.id);
  const gaps = await SkillGapModel.find({ userId: req.user!.id })
    .populate("competencyId")
    .sort({ gap: -1 })
    .lean();

  return res.json({
    gaps,
    empty: gaps.length === 0,
    message: gaps.length === 0 ? "No skill-gap data. Set job role in profile and refresh." : undefined
  });
}

export async function refreshSkillGaps(req: AuthenticatedRequest, res: Response) {
  await bootstrapCompetencyScoresFromProfile(req.user!.id);
  await recalculateSkillGaps(req.user!.id);
  await Promise.all([
    generatePersonalizedLearningPath(req.user!.id),
    recalculatePerformance(req.user!.id)
  ]);
  const gaps = await SkillGapModel.find({ userId: req.user!.id }).populate("competencyId").sort({ gap: -1 });
  return res.json({ gaps });
}

const startAssessmentSchema = z.object({
  competencyIds: z.array(z.string()).min(1).max(5),
  countPerCompetency: z.number().int().min(3).max(10).optional(),
  blueprintId: z.string().min(1).optional(),
  blueprintVersion: z.string().min(1).optional()
});

export async function startCompetencyAssessment(req: AuthenticatedRequest, res: Response) {
  const payload = startAssessmentSchema.parse(req.body);
  const profile = await EmployeeProfileModel.findOne({ userId: req.user!.id }).lean();

  const existingActive = await CompetencyAssessmentModel.findOne({
    userId: req.user!.id,
    status: { $in: ["pending_review", "in_progress"] }
  }).sort({ createdAt: -1 }).lean();
  
  if (existingActive) {
    return res.status(409).json({
      message: "An active assessment already exists.",
      assessmentId: String(existingActive._id),
      status: existingActive.status
    });
  }

  const count = payload.countPerCompetency || 5;
  const fallback = buildFallbackAssessmentBlueprint({
    competencyIds: payload.competencyIds,
    questionCountPerCompetency: count
  });
  const { blueprint, source: blueprintSource } = await resolveAssessmentBlueprint({
    blueprintId: payload.blueprintId,
    blueprintVersion: payload.blueprintVersion,
    fallback
  });
  const blueprintCompetencyIds = blueprint.coverage.map((rule) => rule.competencyId);
  if (blueprintSource === "configured" &&
      (blueprintCompetencyIds.length !== payload.competencyIds.length ||
        blueprintCompetencyIds.some((id) => !payload.competencyIds.includes(id)))) {
    return res.status(400).json({ message: "Selected competencies do not match the requested assessment blueprint coverage." });
  }

  const comps = await CompetencyModel.find({ _id: { $in: blueprintCompetencyIds }, isActive: true });
  if (comps.length !== blueprintCompetencyIds.length) return res.status(400).json({ message: "Blueprint references unavailable competencies." });

  const requirements = buildQuestionRequirements(blueprint);
  const compById = new Map(comps.map((comp) => [String(comp._id), comp]));
  const generatedByCompetency = new Map<string, StructuredMcq[]>();
  const generatedQuestions: Array<{ competencyId: string; difficulty: "easy" | "medium" | "hard"; questionType: "mcq" }> = [];
  const allQuestionIds: string[] = [];

  for (const requirement of requirements) {
    const comp = compById.get(requirement.competencyId);
    if (!comp) return res.status(400).json({ message: `Blueprint competency ${requirement.competencyId} is unavailable.` });
    const { questions } = await generateCompetencyAssessmentQuestions({
      competencyName: comp.name,
      difficultyDistribution: requirement.difficultyDistribution,
      count: requirement.questionCount,
      jobRole: profile?.jobRole,
      experienceYears: profile?.yearsOfExperience,
      userId: req.user!.id
    });
    generatedByCompetency.set(requirement.competencyId, questions);
    generatedQuestions.push(...questions.map((question) => ({
      competencyId: requirement.competencyId,
      difficulty: question.difficulty,
      questionType: "mcq" as const
    })));
  }

  validateAssessmentQuestionCoverage(generatedQuestions, blueprint);

  for (const requirement of requirements) {
    const comp = compById.get(requirement.competencyId);
    if (!comp) continue;
    const questions = generatedByCompetency.get(requirement.competencyId) || [];
    const saved = await persistGeneratedQuestions({
      questions,
      createdBy: req.user!.id,
      competencyId: String(comp._id),
      status: "pending_review",
      language: languageName(profile?.languagePreference),
      runSemanticValidation: true
    });
    allQuestionIds.push(...saved.map((q) => String(q._id)));
    if (saved.length !== questions.length) {
      return res.status(400).json({ message: `Blueprint coverage could not be persisted for competency ${requirement.competencyId}; duplicate or missing questions were detected.` });
    }
  }

  const pendingAssessment = await CompetencyAssessmentModel.create({
    userId: req.user!.id,
    competencyIds: comps.map((comp) => comp._id),
    questionIds: allQuestionIds,
    blueprintId: blueprint.blueprintId,
    blueprintVersion: blueprint.version,
    blueprintSource,
    blueprintCoverage: blueprint.coverage,
    difficultyDistribution: blueprint.difficultyDistribution,
    timeLimitMinutes: blueprint.timeLimitMinutes,
    status: "pending_review"
  });

  const facultyUsers = await UserModel.find({ roles: "faculty" }).select("_id").lean();
  if (facultyUsers.length > 0) {
    const notifications = facultyUsers.map(faculty => ({
      userId: faculty._id,
      title: "New Assessment Review Pending",
      body: `An employee has generated a new competency assessment that requires faculty review.`,
      type: "assessment_review"
    }));
    await NotificationModel.insertMany(notifications);
    const io = req.app?.get("io") as import("socket.io").Server | undefined;
    if (io) {
      facultyUsers.forEach(faculty => {
        io.to(`user:${faculty._id}`).emit("notification:new", { type: "assessment_review" });
      });
    }
  }

  const assessment = {
    _id: pendingAssessment._id,
    id: String(pendingAssessment._id),
    userId: String(req.user!.id),
    competencyIds: comps.map((comp) => String(comp._id)),
    questionIds: allQuestionIds,
    blueprintId: blueprint.blueprintId,
    blueprintVersion: blueprint.version,
    blueprintSource,
    status: "pending_review",
    reviewRequired: true,
    playable: false,
    questionCount: allQuestionIds.length,
    timeLimitMinutes: blueprint.timeLimitMinutes,
    createdAt: pendingAssessment.createdAt,
    updatedAt: pendingAssessment.updatedAt
  } as const;

  return res.status(202).json({
    assessment,
    assessmentId: String(pendingAssessment._id),
    quiz: null,
    questions: [],
    status: "pending_review",
    reviewRequired: true,
    playable: false,
    questionCount: allQuestionIds.length,
    questionIds: allQuestionIds,
    blueprintId: blueprint.blueprintId,
    blueprintVersion: blueprint.version,
    blueprintSource,
    timeLimitMinutes: blueprint.timeLimitMinutes,
    message: "Questions passed structural validation and are pending authorized human review before publication."
  });

  /*
    title: `Competency Assessment — ${comps.map((c) => c.name).join(", ")}`,
}

  */
}

const finalizeAssessmentSchema = z.object({
  assessmentId: z.string().min(1)
});

export async function finalizeCompetencyAssessmentController(req: AuthenticatedRequest, res: Response) {
  if (!canFinalizeCompetencyAssessment(req.user)) return res.status(403).json({ message: "Only faculty or admin reviewers can finalize competency assessments." });
  const payload = finalizeAssessmentSchema.parse(req.body);
  const result = await finalizeCompetencyAssessment({
    assessmentId: payload.assessmentId,
    finalizedBy: req.user!.id
  });
  return res.status(result.reused ? 200 : 201).json(result);
}

export async function getActiveAssessment(req: AuthenticatedRequest, res: Response) {
  const assessment = await CompetencyAssessmentModel.findOne({
    userId: req.user!.id,
    status: { $in: ["pending_review", "in_progress"] }
  }).sort({ createdAt: -1 }).lean();

  if (!assessment) {
    return res.json({ session: null });
  }

  const { SihQuestionModel } = await import("../../models/sih/SihModels");
  const questions = await SihQuestionModel.find({ _id: { $in: assessment.questionIds } }).lean();

  return res.json({
    assessment: {
      _id: assessment._id,
      id: String(assessment._id),
      userId: String(assessment.userId),
      competencyIds: assessment.competencyIds.map(String),
      questionIds: assessment.questionIds.map(String),
      blueprintId: assessment.blueprintId,
      blueprintVersion: assessment.blueprintVersion,
      blueprintSource: assessment.blueprintSource,
      status: assessment.status,
      reviewRequired: assessment.status === "pending_review",
      playable: assessment.status === "in_progress",
      questionCount: assessment.questionIds.length,
      timeLimitMinutes: assessment.timeLimitMinutes,
      createdAt: assessment.createdAt,
      updatedAt: assessment.updatedAt
    },
    assessmentId: String(assessment._id),
    quiz: null,
    questions: assessment.status === "in_progress" ? questions.map((q: any) => ({
      _id: String(q._id),
      question: q.question,
      options: q.options,
      questionType: q.questionType
    })) : [],
    status: assessment.status,
    reviewRequired: assessment.status === "pending_review",
    playable: assessment.status === "in_progress",
    questionCount: assessment.questionIds.length,
    questionIds: assessment.questionIds.map(String),
    blueprintId: assessment.blueprintId,
    blueprintVersion: assessment.blueprintVersion,
    blueprintSource: assessment.blueprintSource,
    timeLimitMinutes: assessment.timeLimitMinutes,
    message: assessment.status === "pending_review" ? "This assessment is awaiting review before it becomes playable." : "Assessment resumed."
  });
}

export async function completeCompetencyAssessment(req: AuthenticatedRequest, res: Response) {
  const assessmentId = String(req.params.id || "");
  if (!/^[a-f\d]{24}$/i.test(assessmentId)) return res.status(400).json({ message: "Invalid assessment ID" });
  const assessment = await CompetencyAssessmentModel.findOne({
    _id: assessmentId,
    userId: req.user!.id
  });
  if (!assessment) return res.status(404).json({ message: "Assessment not found" });
  if (assessment.status === "expired") return res.status(410).json({ message: "This assessment has expired." });
  if (assessment.status !== "in_progress") {
    return res.status(409).json({ message: "This assessment has already been completed." });
  }
  if (!assessment.quizId) return res.status(400).json({ message: "Assessment has no quiz" });
  if (assessment.timeLimitMinutes && assessment.startedAt && Date.now() >= assessment.startedAt.getTime() + assessment.timeLimitMinutes * 60_000) {
    await CompetencyAssessmentModel.findOneAndUpdate(
      { _id: assessment._id, userId: req.user!.id, status: "in_progress" },
      { status: "expired", expiredAt: new Date() }
    );
    return res.status(410).json({ message: "This assessment has expired." });
  }
  if (assessment.timeLimitMinutes && !assessment.startedAt) {
    assessment.startedAt = new Date();
    await CompetencyAssessmentModel.findOneAndUpdate(
      { _id: assessment._id, userId: req.user!.id, status: "in_progress", startedAt: { $exists: false } },
      { startedAt: assessment.startedAt }
    );
  }

  const { evaluateQuizAttempt } = await import("../../services/quiz-engine.service");
  const answers = z
    .array(
      z.object({
        questionId: z.string(),
        selected: z.enum(["A", "B", "C", "D", ""]),
        responseTimeMs: z.number().optional()
      })
    )
    .parse(req.body?.answers || []);

  const assessmentQuestionIds = new Set(
    (await FormalQuizModel.findById(assessment.quizId).select("questionIds").lean())?.questionIds.map(String) || []
  );
  if (answers.some((answer) => !assessmentQuestionIds.has(answer.questionId))) {
    return res.status(400).json({ message: "Answers must belong to this assessment." });
  }

  const result = await evaluateQuizAttempt({
    quizId: String(assessment.quizId),
    userId: req.user!.id,
    answers,
    recordLearningOutcome: false,
    runLegacyDownstream: false
  });

  const results = [];
  const { SihQuestionModel } = await import("../../models/sih/SihModels");
  for (const cid of assessment.competencyIds) {
    const qs = await SihQuestionModel.find({
      _id: { $in: result.quiz.questionIds },
      competencyId: cid
    });
    const qids = new Set(qs.map((q) => String(q._id)));
    const subset = result.review.filter((r) => qids.has(String(r.id)));
    const correct = subset.filter((s) => s.isCorrect).length;
    const total = subset.length || 1;
    const accuracy = Math.round((correct / total) * 100);
    const assessedLevel = levelFromAssessmentAccuracy(accuracy);

    const comp = await CompetencyModel.findById(cid);
    await updateCompetencyFromAssessment({
      userId: req.user!.id,
      competencyId: String(cid),
      assessedLevel,
      accuracy,
      rationale: `Assessment accuracy ${accuracy}% on ${comp?.name || "competency"} → level ${assessedLevel}.`
    });
    results.push({
      competencyId: cid,
      assessedLevel,
      accuracy,
      rationale: `Based on ${correct}/${total} correct answers.`
    });
  }

  const completed = await CompetencyAssessmentModel.findOneAndUpdate(
    { _id: assessment._id, userId: req.user!.id, status: "in_progress" },
    { status: "completed", results, completedAt: new Date() },
    { new: true }
  );
  if (!completed) return res.status(409).json({ message: "This assessment was already completed." });
  assessment.status = completed.status;
  assessment.results = results as any;
  assessment.completedAt = completed.completedAt;

  const outcome = await recordLearningOutcome({
    userId: req.user!.id,
    eventType: "assessment.completed",
    resourceType: "assessment",
    resourceId: String(assessment._id),
    source: "arambh",
    sourceEventId: String(assessment._id),
    occurredAt: completed.completedAt || new Date(),
    progressPercent: 100,
    outcomeScore: results.length
      ? Math.round(results.reduce((sum, item) => sum + item.accuracy, 0) / results.length)
      : 0,
    competencyIds: assessment.competencyIds.map(String),
    metadata: {
      quizId: String(assessment.quizId),
      resultCount: results.length,
      competencyAlreadyApplied: true,
      assessmentResults: results
    }
  });
  await processLearningOutcome(outcome.eventId);

  return res.json({
    assessment,
    attempt: result.attempt,
    review: result.review,
    feedbackReady: true
  });
}

export async function listRoleRequirements(req: AuthenticatedRequest, res: Response) {
  const jobRole = String(req.query.jobRole || "");
  const filter = jobRole ? { jobRole } : {};
  const items = await RoleRequirementModel.find(filter).populate("competencyId");
  return res.json({ requirements: items });
}

export async function listJobRoles(_req: AuthenticatedRequest, res: Response) {
  const roles = await RoleRequirementModel.distinct("jobRole");
  return res.json({ jobRoles: roles });
}

export async function getMyCareerRequirements(req: AuthenticatedRequest, res: Response) {
  const profile = await EmployeeProfileModel.findOne({ userId: req.user!.id }).lean();
  const role = String(req.query.role || profile?.desiredCareerRole || "");
  return res.json({ role, requirements: await requirementsForCareerRole(role) });
}
