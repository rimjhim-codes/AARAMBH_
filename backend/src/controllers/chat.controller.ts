import { Response } from "express";
import { z } from "zod";
import { AuthenticatedRequest } from "../middleware/auth";
import { ChatSessionModel, MessageModel } from "../models/LearningModels";
import {
  generateLectureBoundAnswer,
  streamLectureBoundAnswer
} from "../services/gemini.service";
import { getVerifiedRagStatus, retrieveContext } from "../services/rag.service";
import { requireLectureAiFeature } from "../utils/educational-policy";
import { recordStudyActivity } from "../utils/study-stats";
import { EmployeeProfileModel } from "../models/sih/SihModels";
import { languageName } from "../config/languages";

const chatSchema = z.object({
  lectureId: z.string().min(1),
  chatSessionId: z.string().optional(),
  question: z.string().min(3)
});
const streamChatSchema = chatSchema.extend({ socketId: z.string().min(1) });

export async function askTutor(req: AuthenticatedRequest, res: Response) {
  const payload = chatSchema.parse(req.body);

  const ok = await requireLectureAiFeature(req, res, payload.lectureId, "tutor");
  if (!ok) return;
  const ragStatus = await getVerifiedRagStatus();
  if (!ragStatus.available) {
    return res.status(503).json({
      code: "RAG_UNAVAILABLE",
      message: "Semantic lecture search is unavailable until embeddings and Pinecone are configured.",
      reason: ragStatus.reason
    });
  }

  const { context, references, focusTimestampSec } = await retrieveContext(
    payload.lectureId,
    payload.question
  );
  const profile = await EmployeeProfileModel.findOne({ userId: req.user!.id }).select("languagePreference").lean();

  let sessionId = payload.chatSessionId;
  if (!sessionId) {
    const session = await ChatSessionModel.create({
      userId: req.user!.id,
      lectureId: payload.lectureId,
      title: payload.question.slice(0, 60)
    });
    sessionId = session.id;
  }

  const answer = await generateLectureBoundAnswer({
    question: payload.question,
    context,
    focusTimestampSec,
    language: languageName(profile?.languagePreference)
  });

  await MessageModel.create({ chatSessionId: sessionId, role: "user", content: payload.question });
  await MessageModel.create({
    chatSessionId: sessionId,
    role: "assistant",
    content: answer,
    references
  });

  const stats = await recordStudyActivity(req.user!.id, { xpDelta: 5, minutesDelta: 1 });
  const io = req.app.get("io") as import("socket.io").Server | undefined;
  if (stats && io) {
    io.to(`user:${req.user!.id}`).emit("analytics:update", { userStats: stats });
  }

  return res.json({ chatSessionId: sessionId, answer, references, focusTimestampSec });
}

export async function askTutorStream(req: AuthenticatedRequest, res: Response) {
  const { socketId, ...payload } = streamChatSchema.parse(req.body);

  const ok = await requireLectureAiFeature(req, res, payload.lectureId, "tutor_stream");
  if (!ok) return;
  const ragStatus = await getVerifiedRagStatus();
  if (!ragStatus.available) {
    return res.status(503).json({
      code: "RAG_UNAVAILABLE",
      message: "Semantic lecture search is unavailable until embeddings and Pinecone are configured.",
      reason: ragStatus.reason
    });
  }

  const io = req.app.get("io") as import("socket.io").Server;
  const { context, references, focusTimestampSec } = await retrieveContext(
    payload.lectureId,
    payload.question
  );
  const profile = await EmployeeProfileModel.findOne({ userId: req.user!.id }).select("languagePreference").lean();

  let sessionId = payload.chatSessionId;
  if (!sessionId) {
    const session = await ChatSessionModel.create({
      userId: req.user!.id,
      lectureId: payload.lectureId,
      title: payload.question.slice(0, 60)
    });
    sessionId = session.id;
  }

  let full = "";
  try {
    for await (const delta of streamLectureBoundAnswer({
      question: payload.question,
      context,
      focusTimestampSec,
      language: languageName(profile?.languagePreference)
    })) {
      full += delta;
      io.to(socketId).emit("tutor:chunk", { token: delta, done: false });
    }
  } catch (e) {
    console.error(e);
    io.to(socketId).emit("tutor:chunk", {
      token: "",
      done: true,
      error: "Stream failed. Try again or use non-streaming chat.",
      references
    });
    return res.status(500).json({ message: "Stream failed" });
  }

  io.to(socketId).emit("tutor:chunk", { token: "", done: true, references, focusTimestampSec });

  await MessageModel.create({ chatSessionId: sessionId, role: "user", content: payload.question });
  await MessageModel.create({
    chatSessionId: sessionId,
    role: "assistant",
    content: full || "(empty response)",
    references
  });

  const stats = await recordStudyActivity(req.user!.id, { xpDelta: 5, minutesDelta: 1 });
  if (stats) {
    io.to(`user:${req.user!.id}`).emit("analytics:update", { userStats: stats });
  }

  return res.json({ status: "streamed", chatSessionId: sessionId, references, focusTimestampSec });
}

const voiceSchema = z.object({
  lectureId: z.string().min(1),
  transcript: z.string().min(3),
  chatSessionId: z.string().optional()
});

/** Client-side Web Speech API produces text; same RAG flow as POST /chat/ask */
export async function askFromVoiceTranscript(req: AuthenticatedRequest, res: Response) {
  const v = voiceSchema.parse(req.body);

  const allowed = await requireLectureAiFeature(req, res, v.lectureId, "voice_tutor");
  if (!allowed) return;

  req.body = {
    lectureId: v.lectureId,
    chatSessionId: v.chatSessionId,
    question: `[Voice transcript] ${v.transcript}`
  };
  return askTutor(req, res);
}
