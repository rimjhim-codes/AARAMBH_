import { Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { AuthenticatedRequest } from "../../middleware/auth";
import {
  FormalQuizAttemptModel,
  FormalQuizModel,
  CompetencyAssessmentModel,
  SihQuestionModel
} from "../../models/sih/SihModels";
import { LectureModel } from "../../models/Lecture";
import { TranscriptModel } from "../../models/LearningModels";
import {
  adaptiveDifficulty,
  aiFeedbackOnAttempt,
  calculateQuestionAnalytics,
  createQuizFromQuestions,
  evaluateQuizAttempt,
  generateStructuredMcqsFromContent,
  persistGeneratedQuestions
} from "../../services/quiz-engine.service";
import { requireLectureAiFeature } from "../../utils/educational-policy";
import { writeAuditLog } from "../../services/audit-log.service";
import { finalizeCompetencyAssessment } from "../../services/competency-assessment-finalization.service";
import { NotificationModel } from "../../models/Notification";
import { LANGUAGE_NAMES } from "../../config/languages";

function validId(value: string) {
  return mongoose.isValidObjectId(value);
}

function canManageQuiz(quiz: { createdBy: unknown }, user: AuthenticatedRequest["user"]) {
  return user?.role === "admin" || String(quiz.createdBy) === user?.id;
}

export function isTimedAssessmentExpired(startedAt: Date | null | undefined, timeLimitMinutes: number | undefined, now = Date.now()) {
  return Boolean(startedAt && timeLimitMinutes && now >= startedAt.getTime() + timeLimitMinutes * 60_000);
}

export const questionReviewSchema = z.object({
  status: z.enum(["approved", "published", "rejected", "draft"]),
  feedback: z.string().trim().max(1000).optional().default("")
}).superRefine((value, context) => {
  if (value.status === "rejected" && value.feedback.length < 5) {
    context.addIssue({ code: z.ZodIssueCode.too_small, minimum: 5, type: "string", inclusive: true, path: ["feedback"], message: "A rejection reason is required." });
  }
});

export function canReviewQuestion(question: { createdBy: unknown, status?: string }, user: AuthenticatedRequest["user"]) {
  return user?.role === "admin" || (user?.role === "faculty" && (String(question.createdBy) === user.id || question.status === "pending_review"));
}

function canAttemptQuiz(
  quiz: { createdBy: unknown; status: string; assignedTo: unknown[] },
  user: AuthenticatedRequest["user"]
) {
  if (canManageQuiz(quiz, user)) return true;
  if (user?.role !== "employee" || quiz.status !== "published") return false;
  return quiz.assignedTo.length === 0 || quiz.assignedTo.some((id) => String(id) === user.id);
}

export async function generateMcqsFromLecture(req: AuthenticatedRequest, res: Response) {
  const schema = z.object({
    lectureId: z.string().min(1),
    count: z.number().min(1).max(20).optional(),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    topic: z.string().optional(),
    competencyId: z.string().optional(),
    language: z.enum(LANGUAGE_NAMES).optional(),
    autoPublish: z.boolean().optional()
  });
  const payload = schema.parse(req.body);

  const ok = await requireLectureAiFeature(req, res, payload.lectureId, "quiz_generate");
  if (!ok) return;

  const lecture = await LectureModel.findOne({ _id: payload.lectureId, userId: req.user!.id });
  if (!lecture) return res.status(404).json({ message: "Lecture not found" });

  const transcript = await TranscriptModel.findOne({ lectureId: lecture.id }).lean();
  const content =
    (transcript?.chunks || []).map((c) => c.text).join("\n") || lecture.transcript || "";
  if (content.trim().length < 40) {
    return res.status(400).json({ message: "Lecture content too short to generate MCQs." });
  }

  const { questions, provider } = await generateStructuredMcqsFromContent({
    content,
    count: payload.count || 10,
    difficulty: payload.difficulty,
    topic: payload.topic || lecture.title,
    language: payload.language || lecture.language || "English",
    userId: req.user!.id
  });

  const saved = await persistGeneratedQuestions({
    questions,
    createdBy: req.user!.id,
    lectureId: lecture.id,
    competencyId: payload.competencyId,
    // AI-generated questions must always be reviewed before publication.
    // Keep accepting autoPublish for backwards-compatible clients, but never honor it.
    status: "pending_review",
    language: payload.language || lecture.language || "English",
    runSemanticValidation: true
  });

  return res.status(201).json({
    provider,
    generated: questions.length,
    saved: saved.length,
    questions: saved
  });
}

export async function createFormalQuiz(req: AuthenticatedRequest, res: Response) {
  const schema = z.object({
    title: z.string().min(3),
    questionIds: z.array(z.string()).min(1),
    lectureId: z.string().optional(),
    competencyIds: z.array(z.string()).optional(),
    topic: z.string().optional(),
    difficulty: z.enum(["easy", "medium", "hard", "mixed"]).optional(),
    passingPercentage: z.number().min(0).max(100).optional(),
    timeLimitMinutes: z.number().min(5).max(180).optional(),
    negativeMarking: z.boolean().optional(),
    randomize: z.boolean().optional(),
    adaptive: z.boolean().optional(),
    status: z.enum(["draft", "published"]).optional(),
    assignedTo: z.array(z.string()).optional()
  });
  const payload = schema.parse(req.body);
  if (payload.questionIds.some((id) => !validId(id))) {
    return res.status(400).json({ message: "One or more question IDs are invalid." });
  }
  const questions = await SihQuestionModel.find({ _id: { $in: payload.questionIds } }).select("_id");
  if (questions.length !== new Set(payload.questionIds).size) {
    return res.status(400).json({ message: "One or more questions do not exist." });
  }
  if (req.user!.role === "employee") {
    return res.status(403).json({ message: "Employees cannot create formal quizzes." });
  }
  if (req.user!.role === "faculty") {
    const ownedQuestions = await SihQuestionModel.countDocuments({
      _id: { $in: payload.questionIds },
      createdBy: req.user!.id
    });
    if (ownedQuestions !== new Set(payload.questionIds).size) {
      return res.status(403).json({ message: "Faculty can only use questions they own." });
    }
  }
  if (payload.status === "published") {
    const publishable = await SihQuestionModel.countDocuments({
      _id: { $in: payload.questionIds },
      status: { $in: ["approved", "published"] }
    });
    if (publishable !== new Set(payload.questionIds).size) {
      return res.status(400).json({ message: "All questions must be approved before publishing." });
    }
  }
  const quiz = await createQuizFromQuestions({
    ...payload,
    createdBy: req.user!.id
  });
  return res.status(201).json({ quiz });
}

export async function listQuizzes(req: AuthenticatedRequest, res: Response) {
  const role = req.user!.role;
  const filter =
    role === "employee"
      ? {
          $or: [
            { status: "published", assignedTo: req.user!.id },
            { status: "published", assignedTo: { $size: 0 } },
            { createdBy: req.user!.id }
          ]
        }
      : role === "faculty"
        ? { $or: [{ createdBy: req.user!.id }, { status: "published" }] }
        : {};

  const quizzes = await FormalQuizModel.find(filter).sort({ createdAt: -1 }).limit(100);
  return res.json({ quizzes });
}

export async function getQuizForAttempt(req: AuthenticatedRequest, res: Response) {
  if (!validId(String(req.params.id))) return res.status(400).json({ message: "Invalid quiz ID." });
  const quiz = await FormalQuizModel.findById(req.params.id);
  if (!quiz) return res.status(404).json({ message: "Quiz not found" });
  if (!canAttemptQuiz(quiz, req.user)) {
    return res.status(403).json({ message: "You are not authorized to access this quiz." });
  }
  if (quiz.timeLimitEnabled && quiz.timeLimitMinutes) {
    const assessment = await CompetencyAssessmentModel.findOne({ quizId: quiz._id, userId: req.user!.id });
    if (assessment) {
      if (isTimedAssessmentExpired(assessment.startedAt, quiz.timeLimitMinutes)) {
        await CompetencyAssessmentModel.findOneAndUpdate(
          { _id: assessment._id, userId: req.user!.id, status: "in_progress" },
          { status: "expired", expiredAt: new Date() }
        );
        return res.status(410).json({ message: "This assessment has expired." });
      }
      if (!assessment.startedAt && assessment.status === "in_progress") {
        await CompetencyAssessmentModel.findOneAndUpdate(
          { _id: assessment._id, userId: req.user!.id, status: "in_progress", startedAt: { $exists: false } },
          { startedAt: new Date() }
        );
      }
    }
  }

  let questionIds = quiz.questionIds.map(String);
  if (quiz.randomize) {
    questionIds = [...questionIds].sort(() => Math.random() - 0.5);
  }

  const questions = await SihQuestionModel.find({ _id: { $in: questionIds }, status: { $in: ["approved", "published"] } }).select(
    "question options difficulty topic"
  );

  // Preserve randomized order
  const byId = new Map(questions.map((q) => [String(q._id), q]));
  const ordered = questionIds.map((id) => byId.get(id)).filter(Boolean).map((question: any) => {
    const labels = (["A", "B", "C", "D"] as const).slice().sort(() => Math.random() - 0.5);
    const options: Record<string, string> = {};
    const optionMap: Record<string, string> = {};
    labels.forEach((original, index) => {
      const displayed = (["A", "B", "C", "D"] as const)[index];
      options[displayed] = question.options[original];
      optionMap[displayed] = original;
    });
    return { _id: question._id, question: question.question, options, optionMap, difficulty: question.difficulty, topic: question.topic };
  });

  return res.json({
    quiz: {
      id: quiz.id,
      title: quiz.title,
      timeLimitMinutes: quiz.timeLimitMinutes,
      passingPercentage: quiz.passingPercentage,
      adaptive: quiz.adaptive,
      timeLimitEnabled: quiz.timeLimitEnabled,
      topic: quiz.topic
    },
    questions: ordered
  });
}

export async function submitFormalQuiz(req: AuthenticatedRequest, res: Response) {
  const schema = z.object({
    answers: z.array(
      z.object({
        questionId: z.string(),
        selected: z.enum(["A", "B", "C", "D", ""]),
        responseTimeMs: z.number().optional()
      })
    ),
    suspiciousActivityCount: z.number().int().min(0).max(100).optional(),
    suspiciousActivityReasons: z.array(z.string().max(200)).max(100).optional()
  });
  const payload = schema.parse(req.body);
  if (!validId(String(req.params.id))) return res.status(400).json({ message: "Invalid quiz ID." });
  const quiz = await FormalQuizModel.findById(req.params.id).select("createdBy status assignedTo");
  if (!quiz) return res.status(404).json({ message: "Quiz not found" });
  if (!canAttemptQuiz(quiz, req.user)) {
    return res.status(403).json({ message: "You are not authorized to submit this quiz." });
  }
  const questionIds = (await FormalQuizModel.findById(req.params.id).select("questionIds").lean())?.questionIds.map(String) || [];
  if (payload.answers.some((answer) => !validId(answer.questionId) || !questionIds.includes(answer.questionId))) {
    return res.status(400).json({ message: "Answers must reference questions in this quiz." });
  }
  const result = await evaluateQuizAttempt({
    quizId: String(req.params.id),
    userId: req.user!.id,
    answers: payload.answers,
    suspiciousActivityCount: payload.suspiciousActivityCount,
    suspiciousActivityReasons: payload.suspiciousActivityReasons
  });

  const feedback = await aiFeedbackOnAttempt({
    percentage: result.attempt.percentage,
    weakTopics: result.attempt.weakTopics || [],
    competencyName: result.quiz.topic,
    userId: req.user!.id
  });

  return res.status(201).json({
    attempt: result.attempt,
    review: result.review,
    feedback
  });
}

export async function listMyQuizAttempts(req: AuthenticatedRequest, res: Response) {
  const attempts = await FormalQuizAttemptModel.find({ userId: req.user!.id })
    .sort({ createdAt: -1 })
    .limit(50)
    .populate("quizId", "title topic");
  return res.json({ attempts });
}

export async function getQuestionAnalytics(req: AuthenticatedRequest, res: Response) {
  if (!validId(String(req.params.id))) return res.status(400).json({ message: "Invalid question ID." });
  const question = await SihQuestionModel.findById(req.params.id).select("createdBy difficulty").lean();
  if (!question) return res.status(404).json({ message: "Question not found." });
  if (req.user!.role === "faculty" && String(question.createdBy) !== req.user!.id) {
    return res.status(403).json({ message: "You can only view analytics for your own questions." });
  }
  const attempts = await FormalQuizAttemptModel.find({ "answers.questionId": req.params.id }).select("answers").lean();
  const analytics = calculateQuestionAnalytics(String(req.params.id), attempts as any, question.difficulty);
  return res.json({ analytics });
}

export async function getAdaptiveDifficulty(req: AuthenticatedRequest, res: Response) {
  const recent = await FormalQuizAttemptModel.find({ userId: req.user!.id })
    .sort({ createdAt: -1 })
    .limit(5)
    .select("percentage");
  const difficulty = await adaptiveDifficulty(recent.map((r) => r.percentage));
  return res.json({
    difficulty,
    basedOnAttempts: recent.length,
    message:
      recent.length === 0
        ? "No attempt history yet — defaulting to medium."
        : `Based on last ${recent.length} attempt(s).`
  });
}

export async function listQuestionBank(req: AuthenticatedRequest, res: Response) {
  const filter =
    req.user!.role === "employee"
      ? { status: "published" }
      : req.user!.role === "faculty"
        ? {
            $or: [
              { createdBy: req.user!.id, status: { $in: ["pending_review", "approved", "published"] } },
              { status: "pending_review" }
            ]
          }
        : {};
  const questions = await SihQuestionModel.find(filter).sort({ createdAt: -1 }).limit(200);
  return res.json({ questions });
}

export async function reviewQuestion(req: AuthenticatedRequest, res: Response) {
  const payload = questionReviewSchema.parse(req.body);
  const status = payload.status;
  if (!validId(String(req.params.id))) return res.status(400).json({ message: "Invalid question ID." });
  const existing = await SihQuestionModel.findById(req.params.id).select("createdBy status validationStatus semanticValidationStatus");
  if (!existing) return res.status(404).json({ message: "Question not found" });
  if (status === "published" && !["approved", "published"].includes(existing.status)) {
    return res.status(400).json({ message: "Question must be approved before it can be published." });
  }
  if (status === "published" && existing.validationStatus === "failed") {
    return res.status(400).json({ message: "Questions with failed validation cannot be published." });
  }
  if (status === "approved" && !["draft", "pending_review"].includes(existing.status)) {
    return res.status(400).json({ message: "Only draft or pending-review questions can be approved." });
  }
  if (status === "approved" && existing.validationStatus === "failed") {
    return res.status(400).json({ message: "Questions with failed validation cannot be approved." });
  }
  if (["approved", "published"].includes(status) && existing.semanticValidationStatus === "unavailable") {
    return res.status(400).json({ message: "Question semantic validation is unavailable; it cannot be published yet." });
  }
  if (status === "rejected" && payload.feedback.length < 5) {
    return res.status(400).json({ message: "A rejection reason of at least 5 characters is required." });
  }
  if (!canReviewQuestion(existing, req.user)) {
    return res.status(403).json({ message: "You can only review your own questions." });
  }
  const q = await SihQuestionModel.findByIdAndUpdate(req.params.id, {
    status,
    validationStatus: status === "rejected" ? "failed" : status === "approved" || status === "published" ? "passed" : existing.validationStatus,
    reviewedBy: req.user!.id,
    reviewedAt: new Date(),
    reviewFeedback: payload.feedback
  }, { new: true });
  if (!q) return res.status(404).json({ message: "Question not found" });
  await writeAuditLog({ actorId: req.user!.id, action: status === "published" ? "question.publish" : "question.review", resource: String(q._id), meta: { from: existing.status, to: status, feedback: payload.feedback }, req });

  if (["approved", "published", "rejected"].includes(status)) {
    console.log("DEBUG: CompetencyAssessmentModel.find is", CompetencyAssessmentModel.find.toString());
    const assessments = await CompetencyAssessmentModel.find({ questionIds: q._id, status: "pending_review" }).lean();
    for (const assessment of assessments) {
      const relatedQuestions = await SihQuestionModel.find({ _id: { $in: assessment.questionIds } }).select("status").lean();
      const allResolved = relatedQuestions.every(rq => ["approved", "published", "rejected"].includes(rq.status));
      if (allResolved) {
        const anyApproved = relatedQuestions.some(rq => ["approved", "published"].includes(rq.status));
        if (anyApproved) {
          try {
            await finalizeCompetencyAssessment({ assessmentId: String(assessment._id), finalizedBy: req.user!.id });
            await NotificationModel.create({
              userId: assessment.userId,
              title: "Assessment Ready",
              body: "Your competency assessment has been reviewed by faculty and is now ready to begin.",
              type: "assessment_review"
            });
            const io = req.app?.get("io") as import("socket.io").Server | undefined;
            if (io) {
              io.to(`user:${assessment.userId}`).emit("notification:new", { type: "assessment_review" });
            }
          } catch (error) {
            console.error(`Failed to automatically finalize assessment ${assessment._id}:`, error);
          }
        } else {
          await CompetencyAssessmentModel.findByIdAndUpdate(assessment._id, { status: "expired" });
          await NotificationModel.create({
            userId: assessment.userId,
            title: "Assessment Needs Revision",
            body: "Your competency assessment questions were not approved by faculty. Please try generating a new assessment.",
            type: "assessment_review"
          });
          const io = req.app?.get("io") as import("socket.io").Server | undefined;
          if (io) {
            io.to(`user:${assessment.userId}`).emit("notification:new", { type: "assessment_review" });
          }
        }
      }
    }
  }

  return res.json({ question: q });
}
