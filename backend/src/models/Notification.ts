import mongoose, { Schema, Types } from "mongoose";

const NotificationSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", index: true, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    type: { type: String, enum: ["revision", "quiz", "system", "assessment_review", "admin_alert"], default: "system" },
    readAt: Date
  },
  { timestamps: true }
);

export const NotificationModel = mongoose.model("Notification", NotificationSchema);
