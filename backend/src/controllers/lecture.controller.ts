import { Response } from "express";
import pdf from "pdf-parse";
import { z } from "zod";
import { env } from "../config/env";
import { AuthenticatedRequest } from "../middleware/auth";
import type { EducationalInsight } from "../models/Lecture";
import { LectureModel } from "../models/Lecture";
import { PlatformCourseModel } from "../models/sih/SihModels";
import { insightFromLecture } from "../utils/educational-policy";
import { TranscriptModel } from "../models/LearningModels";
import { uploadToCloudinary } from "../services/cloudinary.service";
import { upsertTranscriptChunks } from "../services/rag.service";
import { classifyEducationalContent } from "../services/gemini.service";
import { extractDocxText, extractPptxText } from "../services/document-parser.service";
import {
  extractYoutubeVideoId,
  fetchYoutubeOEmbed,
  fetchYoutubeTranscriptPlan
} from "../services/youtube.service";
import { LANGUAGE_NAMES } from "../config/languages";
import { buildContentSource, normalizeExtractedText } from "../services/content-intelligence.service";

const uploadSchema = z.object({
  title: z.string().min(3),
  sourceType: z.enum(["video", "pdf", "docx", "pptx", "transcript", "youtube"]),
  sourceUrl: z.string().url().optional(),
  transcript: z.string().min(20),
  language: z.enum(LANGUAGE_NAMES).optional()
});
const uploadMetadataSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  sourceType: z.enum(["video", "pdf", "docx", "pptx", "transcript"]).default("transcript"),
  transcript: z.string().optional(),
  language: z.enum(LANGUAGE_NAMES).optional()
});

const SOURCES_WITH_EDUCATIONAL_CLASSIFICATION = ["youtube", "pdf", "docx", "transcript", "video"] as const;

async function buildEducationalInsight(
  title: string,
  transcriptExcerpt: string,
  description?: string
): Promise<EducationalInsight> {
  const contentLength = transcriptExcerpt.length;
  if (!env.geminiApiKey) {
    const fallback = classifyWithLocalFallback(title, transcriptExcerpt, description);
    console.warn("[EDUCATIONAL CLASSIFIER]", {
      path: "fallback",
      provider: "gemini",
      reason: "missing GEMINI_API_KEY",
      contentLength,
      classification: fallback.classification,
      confidence: fallback.confidence
    });
    return fallback;
  }
  try {
    const insight = await classifyEducationalContent({
      title,
      transcriptExcerpt,
      description
    });
    console.info("[EDUCATIONAL CLASSIFIER]", {
      path: "gemini",
      provider: "gemini",
      contentLength: Math.min(contentLength, 14000),
      sourceContentLength: contentLength,
      classification: insight.classification,
      confidence: insight.confidence
    });
    return insight;
  } catch (e) {
    const msg = String((e as Error)?.message || e).slice(0, 1000);
    const fallback = classifyWithLocalFallback(title, transcriptExcerpt, description);
    console.error("[EDUCATIONAL CLASSIFIER]", {
      path: "fallback",
      provider: "gemini",
      reason: msg,
      contentLength,
      classification: fallback.classification,
      confidence: fallback.confidence
    });
    return fallback;
  }
}

function classifyWithLocalFallback(
  title: string,
  content: string,
  description?: string
): EducationalInsight {
  const text = `${title} ${description || ""} ${content}`.toLowerCase();
  const educationalSignals = [
    "lesson", "lecture", "tutorial", "course", "learn", "learning", "explain", "example",
    "exercise", "practice", "assignment", "objective", "definition", "concept", "chapter",
    "javascript", "typescript", "python", "programming", "function", "variable", "algorithm",
    "database", "sql", "statistics", "sampling", "analysis", "documentation", "notes"
  ];
  const nonEducationalSignals = [
    "music video", "official music", "lyrics", "reaction", "prank", "meme", "gossip", "trailer"
  ];
  const educationalHits = educationalSignals.reduce((count, signal) => count + (text.includes(signal) ? 1 : 0), 0);
  const nonEducationalHits = nonEducationalSignals.reduce((count, signal) => count + (text.includes(signal) ? 1 : 0), 0);
  const hasInstructionalStructure = /(^|\n)\s*(step|chapter|lesson|example|exercise|summary|objective)\s*[:.)-]/im.test(content);
  const score = educationalHits * 5 + (hasInstructionalStructure ? 15 : 0) + (content.length >= 500 ? 10 : 0) - nonEducationalHits * 15;

  if (score >= 45 && educationalHits >= 3) {
    return {
      classification: "EDUCATIONAL",
      confidence: Math.min(90, 55 + score),
      reasoning: "Gemini was unavailable; local fallback found instructional structure and domain-specific learning signals in the material."
    };
  }
  if (score <= 0 && nonEducationalHits > educationalHits) {
    return {
      classification: "NON_EDUCATIONAL",
      confidence: Math.min(85, 55 + Math.abs(score)),
      reasoning: "Gemini was unavailable; local fallback found stronger entertainment-oriented signals than instructional content."
    };
  }
  return {
    classification: "PARTIALLY_EDUCATIONAL",
    confidence: Math.max(35, Math.min(65, 45 + score)),
    reasoning: "Gemini was unavailable; local fallback found mixed or insufficiently decisive instructional signals."
  };
}

export async function createLecture(req: AuthenticatedRequest, res: Response) {
  const payload = uploadSchema.parse(req.body);

  let educationalInsight: EducationalInsight | undefined;
  if ((SOURCES_WITH_EDUCATIONAL_CLASSIFICATION as readonly string[]).includes(payload.sourceType)) {
    educationalInsight = await buildEducationalInsight(
      payload.title,
      payload.transcript,
      payload.sourceUrl ? `Source: ${payload.sourceUrl}` : undefined
    );
  }

  const lecture = await LectureModel.create({
    userId: req.user!.id,
    title: payload.title,
    sourceType: payload.sourceType,
    sourceUrl: payload.sourceUrl,
    transcript: payload.transcript,
    language: payload.language || "English",
    ...(educationalInsight && {
      educationalClassification: educationalInsight.classification,
      educationalConfidence: educationalInsight.confidence,
      educationalReasoning: educationalInsight.reasoning
    })
  });

  await processLectureTranscript(lecture.id, payload.transcript, { title: payload.title, language: payload.language, sourceUrl: payload.sourceUrl, sourceType: payload.sourceType });
  lecture.status = "processed";
  await lecture.save();

  return res.status(201).json(
    educationalInsight ? { lecture, educationalInsight } : { lecture }
  );
}

const youtubeIngestSchema = z.object({
  youtubeUrl: z.string().min(1),
  title: z.string().min(3).optional(),
  language: z.enum(LANGUAGE_NAMES).optional()
});

/**
 * Ingest a public YouTube video: metadata (oEmbed), timed transcript, chunking, Mongo + Pinecone.
 */
export async function ingestYoutube(req: AuthenticatedRequest, res: Response) {
  const payload = youtubeIngestSchema.parse(req.body);
  const videoId = extractYoutubeVideoId(payload.youtubeUrl);
  if (!videoId) {
    return res.status(400).json({ message: "Invalid or unsupported YouTube URL." });
  }

  let meta: { title: string; thumbnailUrl: string; channelTitle?: string };
  try {
    meta = await fetchYoutubeOEmbed(videoId);
  } catch {
    return res.status(400).json({ message: "Video not found or metadata unavailable." });
  }

  let plan: Awaited<ReturnType<typeof fetchYoutubeTranscriptPlan>>;
  try {
    plan = await fetchYoutubeTranscriptPlan(videoId);
  } catch (e) {
    const err = e as { message?: string };
    if (err?.message === "empty_transcript") {
      return res.status(400).json({ message: "Transcript is empty." });
    }
    return res.status(400).json({
      message:
        "Could not fetch captions. The video may have no transcript, captions disabled, or restricted access."
    });
  }

  if (plan.fullText.trim().length < 20) {
    return res.status(400).json({ message: "Transcript content too short after processing." });
  }

  const title = payload.title?.trim() || meta.title;

  const educationalInsight = await buildEducationalInsight(
    title,
    plan.fullText,
    meta.channelTitle ? `Channel: ${meta.channelTitle}` : undefined
  );

  const lecture = await LectureModel.create({
    userId: req.user!.id,
    title,
    sourceType: "youtube",
    sourceUrl: `https://www.youtube.com/watch?v=${videoId}`,
    thumbnailUrl: meta.thumbnailUrl,
    channelTitle: meta.channelTitle,
    transcript: plan.fullText,
    language: payload.language || "English",
    durationSec: plan.durationSec,
    educationalClassification: educationalInsight.classification,
    educationalConfidence: educationalInsight.confidence,
    educationalReasoning: educationalInsight.reasoning
  });

  await persistLectureTranscriptChunks(
    lecture.id,
    plan.chunks.map((c) => ({
      text: c.text,
      startSec: c.startSec,
      endSec: c.endSec
    })),
    { title, language: payload.language, sourceUrl: `https://www.youtube.com/watch?v=${videoId}`, sourceType: "youtube" }
  );

  lecture.status = "processed";
  await lecture.save();

  return res.status(201).json({
    lecture,
    educationalInsight,
    video: {
      title,
      thumbnail: meta.thumbnailUrl,
      durationSec: plan.durationSec,
      transcript: plan.fullText
    }
  });
}

export async function listLectures(req: AuthenticatedRequest, res: Response) {
  const data = await LectureModel.find({ userId: req.user!.id }).sort({ createdAt: -1 });
  return res.json(data);
}

export async function getLectureById(req: AuthenticatedRequest, res: Response) {
  const lectureId = String(req.params.id || "");
  let lecture = await LectureModel.findOne({ _id: lectureId, userId: req.user!.id });
  if (!lecture) {
    const catalogCourse = await PlatformCourseModel.findOne({
      lectureIds: lectureId,
      catalogType: "platform",
      isActive: true
    }).select("_id").lean();
    if (catalogCourse) lecture = await LectureModel.findOne({ _id: lectureId, status: "processed" });
  }
  if (!lecture) return res.status(404).json({ message: "Lecture not found" });
  const transcript = await TranscriptModel.findOne({ lectureId: lecture.id }).sort({ createdAt: -1 });
  return res.json({
    lecture,
    transcript: transcript?.toObject() || null,
    educationalInsight: insightFromLecture(lecture)
  });
}

export async function uploadLectureFile(req: AuthenticatedRequest, res: Response) {
  const file = req.file;
  const metadata = uploadMetadataSchema.parse(req.body);
  const title = metadata.title?.trim() || file?.originalname || "Untitled Lecture";
  const sourceType = metadata.sourceType;
  if (!file) return res.status(400).json({ message: "file is required" });

  let transcript = "";
  let sourceUrl = "";

  try {
    if (sourceType === "pdf") {
      const parsed = await pdf(file.buffer);
      transcript = parsed.text;
    } else if (sourceType === "docx") {
      transcript = await extractDocxText(file.buffer);
    } else if (sourceType === "pptx") {
      transcript = await extractPptxText(file.buffer);
    } else if (sourceType === "transcript") {
      transcript = file.buffer.toString("utf8");
    } else if (sourceType === "video") {
      const b64 = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
      sourceUrl = await uploadToCloudinary(b64, "video");
      transcript = metadata.transcript || "";
    } else {
      return res.status(400).json({ message: "Unsupported source type." });
    }
  } catch (error) {
    return res.status(400).json({ message: error instanceof Error ? `Could not extract file text: ${error.message}` : "Could not extract file text." });
  }

  if (transcript.trim().length < 20) {
    return res.status(400).json({ message: "Transcript content too short after processing" });
  }

  let educationalInsight: EducationalInsight | undefined;
  if ((SOURCES_WITH_EDUCATIONAL_CLASSIFICATION as readonly string[]).includes(sourceType)) {
    educationalInsight = await buildEducationalInsight(
      title,
      transcript,
      `Uploaded file type: ${sourceType}`
    );
  }

  const lecture = await LectureModel.create({
    userId: req.user!.id,
    title,
    sourceType,
    sourceUrl,
    transcript,
    language: metadata.language || "English",
    ...(educationalInsight && {
      educationalClassification: educationalInsight.classification,
      educationalConfidence: educationalInsight.confidence,
      educationalReasoning: educationalInsight.reasoning
    })
  });
  await processLectureTranscript(lecture.id, transcript, { title, language: metadata.language, sourceUrl, sourceType });
  lecture.status = "processed";
  await lecture.save();
  return res.status(201).json(
    educationalInsight ? { lecture, educationalInsight } : { lecture }
  );
}

async function persistLectureTranscriptChunks(
  lectureId: string,
  chunks: Array<{ text: string; startSec: number; endSec: number }>,
  metadata: { title?: string; language?: string; sourceUrl?: string; sourceType?: string } = {}
) {
  const normalizedChunks = chunks.map((chunk) => ({ ...chunk, text: normalizeExtractedText(chunk.text) })).filter((chunk) => chunk.text);
  const source = buildContentSource({ sourceType: "lecture", sourceId: lectureId, title: metadata.title || "Lecture", text: normalizedChunks.map((chunk) => chunk.text).join("\n\n"), language: metadata.language, sourceUrl: metadata.sourceUrl, provider: metadata.sourceType === "youtube" ? "youtube" : "local" });
  const withIds = normalizedChunks.map((c, idx) => ({
    id: `${lectureId}:${source.contentVersion}:${idx}`,
    chunkId: `${lectureId}:${source.contentVersion}:${idx}`,
    text: c.text,
    startSec: c.startSec,
    endSec: c.endSec,
    contentHash: buildContentSource({ sourceType: "lecture", sourceId: `${lectureId}-${idx}`, title: metadata.title || "Lecture", text: c.text }).contentHash,
    contentVersion: source.contentVersion,
    sequence: idx,
    language: source.originalLanguage
  }));

  await TranscriptModel.findOneAndUpdate(
    { lectureId, contentVersion: source.contentVersion },
    {
      lectureId,
      sourceType: metadata.sourceType || "lecture",
      sourceId: lectureId,
      contentHash: source.contentHash,
      contentVersion: source.contentVersion,
      language: source.originalLanguage,
      provider: source.provider,
      sourceUrl: metadata.sourceUrl,
      ingestedAt: new Date(),
      chunks: withIds.map((c) => ({ ...c, embeddingId: c.id }))
    },
    { upsert: true, new: true }
  );
  await upsertTranscriptChunks(lectureId, withIds);
}

async function processLectureTranscript(lectureId: string, transcript: string, metadata: { title?: string; language?: string; sourceUrl?: string; sourceType?: string } = {}) {
  const normalized = normalizeExtractedText(transcript);
  const chunks = normalized
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((text, idx) => ({
      text,
      startSec: idx * 30,
      endSec: idx * 30 + 30
    }));
  await persistLectureTranscriptChunks(lectureId, chunks);
}
