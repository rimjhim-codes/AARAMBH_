import mongoose, { Document, Schema, Types } from "mongoose";

export const LEARNING_PROGRESS_RESOURCE_TYPES = [
  "platform_course",
  "lecture",
  "learning_material",
  "virtual_lab",
  "igot_course",
  "nssta_course",
  "training"
] as const;
export type LearningProgressResourceType = (typeof LEARNING_PROGRESS_RESOURCE_TYPES)[number];

export const LEARNING_PROGRESS_STATUSES = ["not_started", "in_progress", "completed"] as const;
export type LearningProgressStatus = (typeof LEARNING_PROGRESS_STATUSES)[number];

export interface ILearningProgress extends Document {
  userId: Types.ObjectId;
  resourceType: LearningProgressResourceType;
  resourceId: string;
  source: "arambh" | "platform" | "igot" | "nssta" | "system";
  progressPercent: number;
  status: LearningProgressStatus;
  startedAt?: Date;
  lastActivityAt: Date;
  completedAt?: Date;
  completedOutcomeEventId?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Progress is deliberately separate from LearningActivity and LearningOutcomeEvent:
 * one document is the current resource state, activity remains an audit-ish signal,
 * and validated outcomes remain immutable/idempotent canonical events.
 */
const LearningProgressSchema = new Schema<ILearningProgress>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    resourceType: { type: String, enum: LEARNING_PROGRESS_RESOURCE_TYPES, required: true },
    resourceId: { type: String, required: true },
    source: { type: String, enum: ["arambh", "platform", "igot", "nssta", "system"], required: true },
    progressPercent: { type: Number, min: 0, max: 100, default: 0 },
    status: { type: String, enum: LEARNING_PROGRESS_STATUSES, default: "not_started" },
    startedAt: Date,
    lastActivityAt: { type: Date, default: Date.now },
    completedAt: Date,
    completedOutcomeEventId: String,
    metadata: { type: Schema.Types.Mixed, default: {} }
  },
  { timestamps: true }
);

LearningProgressSchema.index({ userId: 1, resourceType: 1, resourceId: 1 }, { unique: true });
LearningProgressSchema.index({ userId: 1, lastActivityAt: -1 });
LearningProgressSchema.index({ userId: 1, status: 1 });
LearningProgressSchema.index({ userId: 1, source: 1 });

export const LearningProgressModel = mongoose.model<ILearningProgress>("LearningProgress", LearningProgressSchema);
