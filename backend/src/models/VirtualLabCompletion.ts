import mongoose, { Schema } from "mongoose";

const VirtualLabCompletionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    labId: { type: String, required: true, index: true },
    competencyCode: { type: String, required: true },
    score: { type: Number, required: true, min: 0, max: 100 },
    submission: { type: Schema.Types.Mixed },
    attemptId: { type: Schema.Types.ObjectId, ref: "VirtualLabAttempt" },
    feedback: { type: String, default: "" },
    validationVersion: { type: String, default: "1" },
    completedAt: { type: Date, default: Date.now, required: true }
  },
  { timestamps: true }
);

VirtualLabCompletionSchema.index({ userId: 1, labId: 1 }, { unique: true });

export const VirtualLabCompletionModel = mongoose.model("VirtualLabCompletion", VirtualLabCompletionSchema);
