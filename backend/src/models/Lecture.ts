import mongoose, { Document, Schema, Types } from "mongoose";

export type EducationalClassification =
  | "EDUCATIONAL"
  | "PARTIALLY_EDUCATIONAL"
  | "NON_EDUCATIONAL";

/** Returned by classifier and stored on lectures / API payloads */
export interface EducationalInsight {
  classification: EducationalClassification;
  /** 0–100 */
  confidence: number;
  reasoning: string;
}

export interface ILecture extends Document {
  demoKey?: string;
  userId: Types.ObjectId;
  title: string;
  sourceType: "video" | "pdf" | "docx" | "pptx" | "transcript" | "youtube";
  sourceUrl?: string;
  thumbnailUrl?: string;
  channelTitle?: string;
  transcript: string;
  language: string;
  durationSec?: number;
  topicTags: string[];
  status: "uploaded" | "processed";
  /** Gemini classifier output; legacy docs omit → treated as EDUCATIONAL in policy helpers */
  educationalClassification?: EducationalClassification;
  educationalConfidence?: number;
  educationalReasoning?: string;
}

const LectureSchema = new Schema<ILecture>(
  {
    demoKey: { type: String, unique: true, sparse: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
    title: { type: String, required: true },
    sourceType: {
      type: String,
      enum: ["video", "pdf", "docx", "pptx", "transcript", "youtube"],
      required: true
    },
    sourceUrl: String,
    thumbnailUrl: String,
    channelTitle: String,
    transcript: { type: String, default: "" },
    language: { type: String, default: "English" },
    durationSec: Number,
    topicTags: [{ type: String }],
    status: { type: String, enum: ["uploaded", "processed"], default: "uploaded" },
    educationalClassification: {
      type: String,
      enum: ["EDUCATIONAL", "PARTIALLY_EDUCATIONAL", "NON_EDUCATIONAL"]
    },
    educationalConfidence: { type: Number, min: 0, max: 100 },
    educationalReasoning: { type: String }
  },
  { timestamps: true }
);

export const LectureModel = mongoose.model<ILecture>("Lecture", LectureSchema);
