import { Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { EducationalInsight, ILecture, LectureModel } from "../models/Lecture";
import { PlatformCourseModel } from "../models/sih/SihModels";

export type AiFeature =
  | "tutor"
  | "tutor_stream"
  | "voice_tutor"
  | "flashcards_generate"
  | "revision_plan"
  | "quiz_generate"
  | "adaptive_quiz"
  | "summary_full"
  | "summary_basic"
  | "recommendations"
  | "timeline"
  | "mindmap"
  | "interview"
  | "live_assistant"
  | "translate"
  | "image_qa";

export const SOFT_EDUCATIONAL_WARNING =
  "This content may not be strongly educational. Some AI learning features could be limited.";

/** Legacy lectures without classification → treat as fully educational. */
export function insightFromLecture(lecture: ILecture): EducationalInsight {
  return {
    classification: lecture.educationalClassification ?? "EDUCATIONAL",
    confidence: lecture.educationalConfidence ?? 100,
    reasoning: lecture.educationalReasoning ?? ""
  };
}

export type EffectiveTier = "full" | "partial" | "minimal";

export function resolveEffectiveTier(insight: EducationalInsight): EffectiveTier {
  if (insight.classification === "EDUCATIONAL") {
    return "full";
  }

  const lowConfidence = insight.confidence < 45;

  if (
    insight.classification === "PARTIALLY_EDUCATIONAL" &&
    !lowConfidence
  ) {
    return "partial";
  }

  return "minimal";
}

export function isFeatureAllowed(
  insight: EducationalInsight,
  feature: AiFeature
): boolean {
  const tier = resolveEffectiveTier(insight);

  const full: Record<AiFeature, boolean> = {
    tutor: true,
    tutor_stream: true,
    voice_tutor: true,
    flashcards_generate: true,
    revision_plan: true,
    quiz_generate: true,
    adaptive_quiz: true,
    summary_full: true,
    summary_basic: true,
    recommendations: true,
    timeline: true,
    mindmap: true,
    interview: true,
    live_assistant: true,
    translate: true,
    image_qa: true
  };

  const partial: Record<AiFeature, boolean> = {
    ...full,
    flashcards_generate: false,
    revision_plan: false,
    quiz_generate: false,
    adaptive_quiz: false,
    recommendations: false
  };

  const minimal: Record<AiFeature, boolean> = {
    tutor: false,
    tutor_stream: false,
    voice_tutor: false,
    flashcards_generate: false,
    revision_plan: false,
    quiz_generate: false,
    adaptive_quiz: false,
    summary_full: false,
    summary_basic: true,
    recommendations: false,
    timeline: true,
    mindmap: false,
    interview: false,
    live_assistant: false,
    translate: true,
    image_qa: false
  };

  const matrix =
    tier === "full"
      ? full
      : tier === "partial"
      ? partial
      : minimal;

  return matrix[feature];
}

export function featureRestrictedResponse(
  res: Response,
  insight: EducationalInsight,
  message = "This AI feature is not available for this content based on its educational classification."
) {
  return res.status(403).json({
    code: "FEATURE_RESTRICTED",
    message,
    educationalInsight: insight
  });
}

/**
 * Resolve a lecture only when the learner owns it or it is published through
 * an active ARAMBH platform course. Platform-course attachment is the
 * resource-level authority for shared demo/catalogue content; it does not
 * make arbitrary lecture IDs public.
 */
export async function resolveAuthorizedLecture(
  req: AuthenticatedRequest,
  lectureId: string
): Promise<ILecture | null> {
  const ownedLecture = await LectureModel.findOne({
    _id: lectureId,
    userId: req.user!.id
  });

  if (ownedLecture) return ownedLecture;

  const publishedCourse = await PlatformCourseModel.findOne({
    lectureIds: lectureId,
    catalogType: "platform",
    isActive: true
  }).select("_id").lean();

  if (!publishedCourse) return null;

  return LectureModel.findOne({
    _id: lectureId,
    status: "processed"
  });
}

export async function requireLectureAiFeature(
  req: AuthenticatedRequest,
  res: Response,
  lectureId: string,
  feature: AiFeature
): Promise<ILecture | null> {
  const lecture = await resolveAuthorizedLecture(req, lectureId);

  if (!lecture) {
    res.status(404).json({
      message: "Lecture not found"
    });

    return null;
  }

  const insight = insightFromLecture(lecture);

  if (!isFeatureAllowed(insight, feature)) {
    featureRestrictedResponse(res, insight);

    return null;
  }

  return lecture;
}

/** Structured summary vs shorter basic summary based on classification. */
export async function requireLectureForSummary(
  req: AuthenticatedRequest,
  res: Response,
  lectureId: string
): Promise<{ lecture: ILecture; mode: "full" | "basic" } | null> {
  const lecture = await LectureModel.findOne({
    _id: lectureId,
    userId: req.user!.id
  });

  if (!lecture) {
    res.status(404).json({
      message: "Lecture not found"
    });

    return null;
  }

  const insight = insightFromLecture(lecture);

  if (isFeatureAllowed(insight, "summary_full")) {
    return {
      lecture,
      mode: "full"
    };
  }

  if (isFeatureAllowed(insight, "summary_basic")) {
    return {
      lecture,
      mode: "basic"
    };
  }

  featureRestrictedResponse(res, insight);

  return null;
}
