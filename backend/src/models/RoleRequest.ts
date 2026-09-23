import mongoose, { Schema } from "mongoose";

export type RoleRequestStatus = "pending" | "approved" | "rejected";

const RoleRequestSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    requestedRole: { type: String, enum: ["faculty"], required: true },
    // Optional at schema level so legacy pending requests remain reviewable;
    // the new request endpoint requires these values.
    designationSnapshot: { type: String, trim: true, maxlength: 160 },
    justification: { type: String, trim: true, maxlength: 1200 },
    experienceNotes: { type: String, trim: true, maxlength: 1200 },
    supportingDocument: {
      url: { type: String, trim: true },
      originalName: { type: String, trim: true, maxlength: 255 },
      mimeType: { type: String, trim: true, maxlength: 120 },
      size: { type: Number, min: 0 },
      uploadedAt: { type: Date }
    },
    interviewConducted: { type: Boolean, default: false },
    interviewNotes: { type: String, trim: true, maxlength: 600 },
    rejectionReason: { type: String, trim: true, maxlength: 600 },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    requestedAt: { type: Date, default: Date.now, required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: Date
  },
  { timestamps: true }
);

RoleRequestSchema.index(
  { userId: 1, requestedRole: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);

export const RoleRequestModel = mongoose.model("RoleRequest", RoleRequestSchema);
