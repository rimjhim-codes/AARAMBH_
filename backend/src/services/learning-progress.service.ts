import { Types } from "mongoose";
import { LearningProgressModel, type LearningProgressResourceType, type LearningProgressStatus } from "../models/LearningProgress";
import { PlatformCourseModel, LearningRecommendationModel } from "../models/sih/SihModels";
import { recordLearningOutcome, type LearningOutcomeSource } from "./learning-outcome.service";
import { processLearningOutcome } from "./learning-outcome-coordinator.service";
import { recordLearningActivity } from "./performance.service";

export type LearningProgressUpdate = {
  userId: string;
  resourceType: LearningProgressResourceType;
  resourceId: string;
  source: "arambh" | "platform" | "igot" | "nssta" | "system";
  progressPercent: number;
  status?: LearningProgressStatus;
  metadata?: Record<string, unknown>;
  occurredAt?: Date;
  emitActivity?: boolean;
  emitOutcome?: boolean;
};

function outcomeSource(source: LearningProgressUpdate["source"]): LearningOutcomeSource {
  return source === "arambh" ? "arambh" : source;
}

function clampProgress(progressPercent: number) {
  if (!Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100) {
    throw new Error("Progress must be between 0 and 100.");
  }
  return Math.round(progressPercent);
}

function statusFor(progressPercent: number, requested?: LearningProgressStatus): LearningProgressStatus {
  if (requested === "completed" && progressPercent < 100) {
    throw new Error("Completed progress must be 100 percent.");
  }
  if (progressPercent >= 100) return "completed";
  if (progressPercent > 0 || requested === "in_progress") return "in_progress";
  return requested || "not_started";
}

async function recordProgressOutcome(input: LearningProgressUpdate, progressPercent: number) {
  return recordLearningOutcome({
    userId: input.userId,
    eventType: "learning.progressed",
    resourceType: "learning_activity",
    resourceId: `${input.resourceType}:${input.resourceId}`,
    source: outcomeSource(input.source),
    sourceEventId: `${input.resourceType}:${input.resourceId}:progress:${progressPercent}`,
    occurredAt: input.occurredAt,
    progressPercent,
    metadata: { ...(input.metadata || {}), status: statusFor(progressPercent, input.status) }
  });
}

async function persistProgress(input: LearningProgressUpdate) {
  const progressPercent = clampProgress(input.progressPercent);
  const existing = await LearningProgressModel.findOne({
    userId: input.userId,
    resourceType: input.resourceType,
    resourceId: input.resourceId
  });
  if (existing && progressPercent < existing.progressPercent) {
    throw new Error("Progress cannot decrease.");
  }
  const status = statusFor(progressPercent, input.status);
  const now = input.occurredAt || new Date();
  const wasMeaningful = !existing || Math.abs(existing.progressPercent - progressPercent) >= 5 || existing.status !== status;
  const doc = existing || new LearningProgressModel({
    userId: input.userId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    source: input.source,
    progressPercent: 0,
    status: "not_started"
  });
  doc.source = input.source;
  doc.progressPercent = progressPercent;
  doc.status = status;
  doc.lastActivityAt = now;
  doc.startedAt = doc.startedAt || (progressPercent > 0 ? now : undefined);
  if (status === "completed") doc.completedAt = doc.completedAt || now;
  if (input.metadata) doc.metadata = { ...(doc.metadata || {}), ...input.metadata };
  await doc.save();

  if (input.emitActivity !== false && wasMeaningful) {
    await recordLearningActivity({
      userId: input.userId,
      type: input.resourceType === "virtual_lab" ? "lab" : input.resourceType === "training" || input.resourceType === "nssta_course" ? "training" : input.resourceType === "igot_course" || input.resourceType === "platform_course" ? "course" : "lecture_watch",
      minutes: Number(input.metadata?.minutes || 0),
      meta: { resourceType: input.resourceType, resourceId: input.resourceId, progressPercent, status }
    });
  }
  return { doc, progressPercent, status, wasMeaningful };
}

export async function upsertLearningProgress(input: LearningProgressUpdate) {
  const result = await persistProgress(input);
  const outcome = result.wasMeaningful && input.emitOutcome !== false
    ? await recordProgressOutcome(input, result.progressPercent)
    : undefined;
  return { progress: result.doc, outcome };
}

export async function refreshPlatformCourseProgress(userId: string, courseCode: string) {
  const course = await PlatformCourseModel.findOne({ code: courseCode, catalogType: "platform", isActive: true }).lean();
  if (!course) throw new Error("Platform course not found.");
  const lectureIds = (course.lectureIds || []).map(String);
  if (!lectureIds.length) {
    return { progress: null, completionOutcome: undefined, completionValidated: false };
  }
  const lectureProgress = await LearningProgressModel.find({
    userId,
    resourceType: "lecture",
    resourceId: { $in: lectureIds }
  }).lean();
  const byId = new Map(lectureProgress.map((item) => [item.resourceId, item]));
  const progressPercent = Math.round(lectureIds.reduce((sum, id) => sum + (byId.get(id)?.progressPercent || 0), 0) / lectureIds.length);
  const completed = lectureIds.every((id) => byId.get(id)?.status === "completed");
  const saved = await persistProgress({
    userId,
    resourceType: "platform_course",
    resourceId: courseCode,
    source: "platform",
    progressPercent,
    status: completed ? "completed" : progressPercent > 0 ? "in_progress" : "not_started",
    metadata: { title: course.title, lectureCount: lectureIds.length },
    emitActivity: false
  });
  await LearningRecommendationModel.updateOne(
    { userId, source: "platform", externalId: courseCode },
    { $set: { status: saved.status === "completed" ? "completed" : saved.status === "in_progress" ? "in_progress" : "enrolled" } }
  );
  if (!completed || saved.status !== "completed" || !saved.wasMeaningful) {
    return { progress: saved.doc, completionOutcome: undefined, completionValidated: completed };
  }
  const completionOutcome = await recordLearningOutcome({
    userId,
    eventType: "course.completed",
    resourceType: "course",
    resourceId: courseCode,
    source: "platform",
    sourceEventId: `${userId}:platform:${courseCode}:completion`,
    progressPercent: 100,
    competencyIds: [],
    metadata: { title: course.title, completionValidated: true, competencyEvidence: false }
  });
  await processLearningOutcome(completionOutcome.eventId);
  return { progress: saved.doc, completionOutcome, completionValidated: true };
}

export async function updateLectureProgress(input: Omit<LearningProgressUpdate, "resourceType"> & { resourceType?: "lecture" }) {
  const result = await upsertLearningProgress({ ...input, resourceType: "lecture" });
  const courseCode = typeof input.metadata?.courseCode === "string" ? input.metadata.courseCode : undefined;
  const courseProgress = courseCode ? await refreshPlatformCourseProgress(input.userId, courseCode) : undefined;
  return { ...result, courseProgress };
}

export async function recordExternalProgressOutcome(input: {
  userId: string;
  resourceType: "igot_course" | "nssta_course" | "training";
  resourceId: string;
  source: "igot" | "nssta";
  progressPercent: number;
  status: LearningProgressStatus;
  metadata?: Record<string, unknown>;
}) {
  // Authenticated production users are Mongo ObjectIds. Keeping malformed
  // legacy/unit-test identities out of this new collection avoids changing
  // the behavior of existing provider controller tests.
  if (!Types.ObjectId.isValid(input.userId)) return { progress: undefined, outcome: undefined };
  const result = await upsertLearningProgress(input);
  if (input.status !== "completed") return result;
  const eventType = input.source === "igot" ? "course.completed" : "training.completed";
  const outcome = await recordLearningOutcome({
    userId: input.userId,
    eventType,
    resourceType: input.source === "igot" ? "course" : "training",
    resourceId: input.resourceId,
    source: input.source,
    sourceEventId: `${input.userId}:${input.source}:${input.resourceId}:completion`,
    progressPercent: 100,
    metadata: { ...(input.metadata || {}) }
  });
  if (result.progress) {
    result.progress.completedOutcomeEventId = outcome.eventId;
    await result.progress.save();
  }
  await processLearningOutcome(outcome.eventId);
  return { ...result, outcome };
}

export async function getLearningProgress(userId: string, resourceType: LearningProgressResourceType, resourceId: string) {
  return LearningProgressModel.findOne({ userId, resourceType, resourceId }).lean();
}
