import { Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../../middleware/auth";
import {
  QuizAttemptModel,
  TopicConfidenceModel
} from "../../models/LearningModels";
import { NotificationModel } from "../../models/Notification";
import {
  generateLectureBoundAnswer,
  generatePersonalizedRecommendations,
  generateQuizMcqsJson
} from "../../services/gemini.service";
import { retrieveContext } from "../../services/rag.service";
import { insightFromLecture, requireLectureAiFeature, requireLectureForSummary } from "../../utils/educational-policy";
import { recordStudyActivity } from "../../utils/study-stats";

const lectureIdSchema = z.object({ lectureId: z.string().min(1) });
const submitQuizSchema = z.object({ lectureId: z.string().min(1), topic: z.string().min(1), score: z.number().finite().min(0), total: z.number().finite().positive() });


export async function submitQuiz(req: AuthenticatedRequest, res: Response) {
  const { lectureId, topic, score, total } = submitQuizSchema.parse(req.body);
  const attempt = await QuizAttemptModel.create({ userId: req.user!.id, lectureId, topic, score, total });
  const confidenceScore = Math.max(0, Math.min(100, Math.round((score / Math.max(1, total)) * 100)));
  const confidenceDoc = await TopicConfidenceModel.findOneAndUpdate(
    { userId: req.user!.id, lectureId, topic },
    {
      userId: req.user!.id,
      lectureId,
      topic,
      confidenceScore,
      $push: { masteryTrend: { date: new Date(), value: confidenceScore } }
    },
    { upsert: true, new: true }
  );
  await NotificationModel.create({
    userId: req.user!.id,
    title: "Quiz evaluated",
    body: `${topic} confidence updated to ${confidenceScore}%`,
    type: "quiz"
  });
  const io = req.app?.get("io") as import("socket.io").Server | undefined;
  if (io) {
    io.to(`user:${req.user!.id}`).emit("notification:new", { type: "quiz" });
  }
  const xpGain = 10 + Math.round((score / Math.max(1, total)) * 40);
  const userStats = await recordStudyActivity(req.user!.id, { xpDelta: xpGain, minutesDelta: 5 });

  if (io) {
    io.to(`user:${req.user!.id}`).emit("analytics:update", {
      topic,
      confidenceScore,
      confidence: confidenceDoc,
      userStats
    });
  }
  return res.status(201).json(attempt);
}


export async function generateQuiz(req: AuthenticatedRequest, res: Response) {
  const { lectureId } = lectureIdSchema.parse(req.body);

  const ok = await requireLectureAiFeature(req, res, lectureId, "quiz_generate");
  if (!ok) return;

  const { context } = await retrieveContext(lectureId, "multiple choice quiz grounded in lecture");
  const raw = await generateQuizMcqsJson(context);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    try {
      const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      parsed = JSON.parse(((fence?.[1] as string) || raw).trim());
    } catch {
      return res.status(502).json({ message: "Quiz generation returned invalid JSON." });
    }
  }
  if (!Array.isArray(parsed)) {
    return res.status(502).json({ message: "Quiz generation returned invalid JSON." });
  }
  return res.json({ questions: parsed });
}

export async function generateRecommendations(req: AuthenticatedRequest, res: Response) {
  const { lectureId } = lectureIdSchema.parse(req.body);

  const ok = await requireLectureAiFeature(req, res, lectureId, "recommendations");
  if (!ok) return;

  const weak = await TopicConfidenceModel.find({
    userId: req.user!.id,
    lectureId,
    confidenceScore: { $lt: 65 }
  })
    .sort({ confidenceScore: 1 })
    .limit(12)
    .lean();

  const weakTopicsSummary =
    weak.length > 0
      ? weak.map((w) => `${w.topic}: ${w.confidenceScore}%`).join("\n")
      : "No recorded weak topics yet — assume mixed beginner understanding.";

  const { context } = await retrieveContext(lectureId, "personalized learning roadmap quiz difficulty");
  const recommendations = await generatePersonalizedRecommendations({
    weakTopicsSummary,
    lectureContext: context
  });

  return res.json({
    recommendations,
    weakTopics: weak.map((w) => ({
      topic: w.topic,
      confidenceScore: w.confidenceScore
    }))
  });
}

export async function generateTimeline(req: AuthenticatedRequest, res: Response) {
  const lectureId = String(req.query.lectureId || "");
  if (!lectureId) return res.status(400).json({ message: "lectureId is required" });

  const ok = await requireLectureAiFeature(req, res, lectureId, "timeline");
  if (!ok) return;

  const { references } = await retrieveContext(
    lectureId,
    "Identify important concepts, repeated topics, coding examples, and exam-priority moments."
  );
  const timeline = references.map((ref, idx) => ({
    id: `${lectureId}-${idx}`,
    timestamp: ref.startSec,
    label: ref.text.slice(0, 90),
    importance: Math.min(100, 70 + idx * 5)
  }));
  return res.json(timeline);
}
