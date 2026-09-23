import mongoose, { Document, Schema, Types } from "mongoose";

export const VIRTUAL_LAB_ATTEMPT_STATUSES = ["started", "submitted", "passed", "failed", "abandoned"] as const;
export type VirtualLabAttemptStatus = (typeof VIRTUAL_LAB_ATTEMPT_STATUSES)[number];

export interface IVirtualLabAttempt extends Document {
  userId: Types.ObjectId;
  labId: string;
  attemptNumber: number;
  startedAt: Date;
  submittedAt?: Date;
  completedAt?: Date;
  status: VirtualLabAttemptStatus;
  validationPassed: boolean;
  score: number;
  feedback: string;
  failureReason: string;
  submittedWorkMetadata?: Record<string, unknown>;
  durationSec?: number;
  outcomeEventId?: string;
}

const VirtualLabAttemptSchema = new Schema<IVirtualLabAttempt>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    labId: { type: String, required: true },
    attemptNumber: { type: Number, required: true, min: 1 },
    startedAt: { type: Date, default: Date.now, required: true },
    submittedAt: Date,
    completedAt: Date,
    status: { type: String, enum: VIRTUAL_LAB_ATTEMPT_STATUSES, default: "started", index: true },
    validationPassed: { type: Boolean, default: false },
    score: { type: Number, min: 0, max: 100, default: 0 },
    feedback: { type: String, default: "" },
    failureReason: { type: String, default: "" },
    // Deliberately excludes submitted code, answers, and validator internals.
    submittedWorkMetadata: { type: Schema.Types.Mixed, default: {} },
    durationSec: { type: Number, min: 0 },
    outcomeEventId: String
  },
  { timestamps: true }
);

VirtualLabAttemptSchema.index({ userId: 1, labId: 1, attemptNumber: 1 }, { unique: true });
VirtualLabAttemptSchema.index({ userId: 1, labId: 1, startedAt: -1 });
VirtualLabAttemptSchema.index({ userId: 1, status: 1 });

export const VirtualLabAttemptModel = mongoose.model<IVirtualLabAttempt>("VirtualLabAttempt", VirtualLabAttemptSchema);
