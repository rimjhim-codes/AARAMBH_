import mongoose, { Document, Schema } from "mongoose";

export interface TtsCacheDocument extends Document {
  cacheKey: string;
  audioBase64: string;
  provider: string;
  createdAt: Date;
}

const TtsCacheSchema = new Schema<TtsCacheDocument>({
  cacheKey: { type: String, required: true, unique: true },
  audioBase64: { type: String, required: true },
  provider: { type: String, required: true, default: "sarvam" },
  createdAt: { type: Date, default: Date.now, expires: 2592000 } // 30 days
});

export const TtsCacheModel = (mongoose.models.TtsCache as mongoose.Model<TtsCacheDocument>) || mongoose.model<TtsCacheDocument>("TtsCache", TtsCacheSchema);
