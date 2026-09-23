import mongoose, { Schema } from "mongoose";

export interface IOtpThrottle extends mongoose.Document {
  key: string;
  email: string;
  ip: string;
  failedAttempts: number;
  lastAttemptAt?: Date;
  lockedUntil?: Date;
}

const OtpThrottleSchema = new Schema<IOtpThrottle>(
  {
    key: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, index: true },
    ip: { type: String, required: true, index: true },
    failedAttempts: { type: Number, default: 0 },
    lastAttemptAt: Date,
    lockedUntil: Date
  },
  { timestamps: true }
);

export const OtpThrottleModel = mongoose.model<IOtpThrottle>(
  "OtpThrottle",
  OtpThrottleSchema
);
