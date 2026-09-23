import { Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../../middleware/auth";
import { TopicConfidenceModel } from "../../models/LearningModels";
import { EmployeeProfileModel } from "../../models/sih/SihModels";
import { resolveLanguagePreference } from "../../config/languages";
import {
  answerWithImageAndContext,
  generateAdaptiveQuizMcqsJson,
  generateInterviewQuestions,
  generateLiveAssistantAnswer,
  generateMindMapMermaid,
  translateEducationalText
} from "../../services/gemini.service";
import { retrieveContext } from "../../services/rag.service";
import { requireLectureAiFeature } from "../../utils/educational-policy";

const lectureIdBody = z.object({
  lectureId: z.string().min(1)
});

export async function generateMindMap(req: AuthenticatedRequest, res: Response) {
  const { lectureId } = lectureIdBody.parse(req.body);

  const ok = await requireLectureAiFeature(req, res, lectureId, "mindmap");
  if (!ok) return;

  const { context } = await retrieveContext(lectureId, "mind map concepts hierarchy");
  const mermaid = await generateMindMapMermaid(context);
  return res.json({ mermaid });
}

export async function translateContent(req: AuthenticatedRequest, res: Response) {
  const transcriptChunkSchema = z.object({
    id: z.string().min(1),
    text: z.string().min(1),
    startSec: z.number(),
    endSec: z.number()
  });

  const schema = z.object({
    text: z.string().min(1).optional(),
    chunks: z.array(transcriptChunkSchema).optional(),
    targetLanguage: z.string().min(2),
    lectureId: z.string().optional()
  }).refine((payload) => !!payload.text || !!payload.chunks, {
    message: "Either text or chunks is required for translation.",
    path: ["text", "chunks"]
  });

  const payload = schema.parse(req.body);
  let text = payload.text;

  if (payload.lectureId) {
    const ok = await requireLectureAiFeature(req, res, payload.lectureId, "translate");
    if (!ok) return;

    const { context } = await retrieveContext(payload.lectureId, "translation scope");
    text = `${context.slice(0, 6000)}\n\n---\nTranslate the selection above and this user snippet:\n${payload.text ?? ""}`;
  }

  if (payload.chunks) {
    const inputLines = payload.chunks
      .map((chunk, index) => `${index + 1}. ${chunk.text}`)
      .join("\n");

    const prompt =
      `Translate the following transcript lines into natural ${payload.targetLanguage}. ` +
      "Return only the translated lines in the same order, without adding language labels or extra commentary." +
      `\n\nInput:\n${inputLines}\n\nOutput:`;

    const translated = await translateEducationalText(prompt, payload.targetLanguage);

    const translatedLines = translated
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => line.replace(/^\d+\.\s*/, "").trim());

    const translatedChunks = payload.chunks.map((chunk, index) => ({
      ...chunk,
      text: translatedLines[index] ?? chunk.text
    }));

    return res.json({ translatedChunks });
  }

  const translated = await translateEducationalText(text ?? "", payload.targetLanguage);
  return res.json({ translated });
}

export async function interviewQuestions(req: AuthenticatedRequest, res: Response) {
  const { lectureId } = lectureIdBody.parse(req.body);

  const ok = await requireLectureAiFeature(req, res, lectureId, "interview");
  if (!ok) return;

  const { context } = await retrieveContext(lectureId, "interview preparation topics");
  const questions = await generateInterviewQuestions(context);
  return res.json({ questions });
}

export async function liveAssistant(req: AuthenticatedRequest, res: Response) {
  const schema = z.object({
    lectureId: z.string().min(1),
    question: z.string().min(3)
  });
  const payload = schema.parse(req.body);

  const ok = await requireLectureAiFeature(req, res, payload.lectureId, "live_assistant");
  if (!ok) return;

  const profile = await EmployeeProfileModel.findOne({ userId: req.user!.id }).select("languagePreference").lean();
  const pref = resolveLanguagePreference(profile?.languagePreference || "en");

  const { context } = await retrieveContext(payload.lectureId, payload.question);
  const answer = await generateLiveAssistantAnswer(payload.question, context, pref.name);
  return res.json({ answer });
}

export async function adaptiveQuiz(req: AuthenticatedRequest, res: Response) {
  const schema = z.object({
    lectureId: z.string().min(1),
    difficulty: z.enum(["easy", "medium", "hard"]).optional(),
    adaptive: z.boolean().optional()
  });
  const payload = schema.parse(req.body);
  const difficulty = payload.difficulty || "medium";

  const ok = await requireLectureAiFeature(req, res, payload.lectureId, "adaptive_quiz");
  if (!ok) return;

  let weakHint = "";
  if (payload.adaptive) {
    const weak = await TopicConfidenceModel.find({
      userId: req.user!.id,
      lectureId: payload.lectureId,
      confidenceScore: { $lt: 60 }
    })
      .sort({ confidenceScore: 1 })
      .limit(8)
      .lean();
    weakHint = weak.map((w) => `${w.topic} (${w.confidenceScore}%)`).join(", ");
  }

  const { context } = await retrieveContext(
    payload.lectureId,
    `adaptive quiz ${difficulty} weak topics ${weakHint}`
  );
  const raw = await generateAdaptiveQuizMcqsJson(context, difficulty, weakHint);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim());
  } catch {
    try {
      const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
      parsed = JSON.parse(((fence?.[1] as string) || raw).trim());
    } catch {
      return res.status(502).json({ message: "Adaptive quiz returned invalid JSON." });
    }
  }
  if (!Array.isArray(parsed)) {
    return res.status(502).json({ message: "Adaptive quiz returned invalid JSON." });
  }
  return res.json({ questions: parsed, difficulty, adaptive: !!payload.adaptive });
}

export async function imageQuestion(req: AuthenticatedRequest, res: Response) {
  const schema = z.object({
    lectureId: z.string().optional(),
    question: z.string().min(2),
    imageBase64: z.string().min(20),
    mimeType: z.string().min(3)
  });
  const payload = schema.parse(req.body);

  let lectureContext: string | undefined;
  if (payload.lectureId) {
    const ok = await requireLectureAiFeature(req, res, payload.lectureId, "image_qa");
    if (!ok) return;

    const { context } = await retrieveContext(payload.lectureId, payload.question);
    lectureContext = context;
  }

  const answer = await answerWithImageAndContext({
    imageBase64: payload.imageBase64,
    mimeType: payload.mimeType,
    question: payload.question,
    lectureContext
  });
  return res.json({ answer });
}
