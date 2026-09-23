import mongoose, { Schema, Types } from "mongoose";

interface IVirtualLabAttemptCounter {
  userId: Types.ObjectId;
  labId: string;
  nextAttemptNumber: number;
}

const VirtualLabAttemptCounterSchema = new Schema<IVirtualLabAttemptCounter>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    labId: { type: String, required: true },
    nextAttemptNumber: { type: Number, default: 0, min: 0 }
  },
  { timestamps: true }
);

VirtualLabAttemptCounterSchema.index({ userId: 1, labId: 1 }, { unique: true });

export const VirtualLabAttemptCounterModel = mongoose.model<IVirtualLabAttemptCounter>("VirtualLabAttemptCounter", VirtualLabAttemptCounterSchema);
