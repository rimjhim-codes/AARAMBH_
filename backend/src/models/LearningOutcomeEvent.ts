import mongoose, { Schema, Types } from "mongoose";

export const LEARNING_OUTCOME_EVENT_TYPES = [
  "assessment.completed",
  "quiz.completed",
  "lab.completed",
  "course.completed",
  "training.completed",
  "learning.progressed"
] as const;
export type LearningOutcomeEventType = (typeof LEARNING_OUTCOME_EVENT_TYPES)[number];

export const LEARNING_OUTCOME_RESOURCE_TYPES = [
  "assessment",
  "quiz",
  "lab",
  "course",
  "training",
  "learning_activity"
] as const;
export type LearningOutcomeResourceType = (typeof LEARNING_OUTCOME_RESOURCE_TYPES)[number];

export const LEARNING_OUTCOME_SOURCES = ["arambh", "igot", "nssta", "platform", "system"] as const;
export type LearningOutcomeSource = (typeof LEARNING_OUTCOME_SOURCES)[number];

export const LEARNING_OUTCOME_STATUSES = ["recorded", "processing", "processed", "failed"] as const;
export type LearningOutcomeStatus = (typeof LEARNING_OUTCOME_STATUSES)[number];

/**
 * Canonical, append-only outcome receipt. This is deliberately separate from
 * LearningActivity: activity describes engagement, while this collection
 * represents a validated outcome that later Phase 5 stages may consume.
 */
const LearningOutcomeEventSchema = new Schema(
  {
    eventId: { type: String, required: true },
    dedupeKey: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    eventType: { type: String, enum: LEARNING_OUTCOME_EVENT_TYPES, required: true, index: true },
    resourceType: { type: String, enum: LEARNING_OUTCOME_RESOURCE_TYPES, required: true },
    resourceId: { type: String, required: true },
    source: { type: String, enum: LEARNING_OUTCOME_SOURCES, required: true },
    sourceEventId: { type: String, default: "" },
    occurredAt: { type: Date, required: true, index: true },
    status: { type: String, enum: LEARNING_OUTCOME_STATUSES, default: "recorded", index: true },
    processingStartedAt: Date,
    processingError: { type: String, default: "" },
    progressPercent: { type: Number, min: 0, max: 100 },
    outcomeScore: { type: Number, min: 0, max: 100 },
    competencyIds: [{ type: Schema.Types.ObjectId, ref: "Competency" }],
    metadata: { type: Schema.Types.Mixed, default: {} },
    // Lightweight closed-loop trace; this is not a second history/projection store.
    personalizationTrace: { type: Schema.Types.Mixed, default: {} },
    processedAt: Date,
    processingVersion: { type: String, default: "1" }
  },
  { timestamps: true }
);

LearningOutcomeEventSchema.index({ userId: 1, occurredAt: -1 });
LearningOutcomeEventSchema.index({ userId: 1, resourceType: 1, resourceId: 1 });

export const LearningOutcomeEventModel = mongoose.model("LearningOutcomeEvent", LearningOutcomeEventSchema);
export type { Types };
