import mongoose, { Schema, Types } from "mongoose";

const TranscriptSchema = new Schema(
  {
    lectureId: { type: Schema.Types.ObjectId, ref: "Lecture", index: true, required: true },
    sourceType: { type: String, default: "lecture" },
    sourceId: { type: String, index: true },
    contentHash: { type: String, index: true },
    contentVersion: { type: String, index: true },
    language: { type: String, default: "English" },
    provider: String,
    sourceUrl: String,
    ingestedAt: Date,
    chunks: [{
      chunkId: String,
      text: String,
      startSec: Number,
      endSec: Number,
      embeddingId: String,
      contentHash: String,
      contentVersion: String,
      sequence: Number,
      heading: String,
      page: Number,
      slide: Number,
      language: String
    }]
  },
  { timestamps: true }
);

const ChatSessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
    lectureId: { type: Schema.Types.ObjectId, ref: "Lecture", index: true, required: true },
    title: { type: String, required: true }
  },
  { timestamps: true }
);

const MessageSchema = new Schema(
  {
    chatSessionId: { type: Schema.Types.ObjectId, ref: "ChatSession", index: true, required: true },
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    references: [{ text: String, startSec: Number, endSec: Number }]
  },
  { timestamps: true }
);

const QuizAttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
    lectureId: { type: Schema.Types.ObjectId, ref: "Lecture", index: true, required: true },
    topic: { type: String, required: true },
    score: { type: Number, required: true },
    total: { type: Number, required: true }
  },
  { timestamps: true }
);

const TopicConfidenceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true, required: true },
    lectureId: { type: Schema.Types.ObjectId, ref: "Lecture", index: true, required: true },
    topic: { type: String, required: true },
    confidenceScore: { type: Number, min: 0, max: 100, required: true },
    masteryTrend: [{ date: Date, value: Number }]
  },
  { timestamps: true }
);


const AnalyticsSchema = new Schema(
  {
    userId: { type: Types.ObjectId, ref: "User", index: true, required: true },
    learningHours: { type: Number, default: 0 },
    productivityScore: { type: Number, default: 0 },
    revisionConsistency: { type: Number, default: 0 },
    preparedScore: { type: Number, default: 0 }
  },
  { timestamps: true }
);

export const TranscriptModel = mongoose.model("Transcript", TranscriptSchema);
export const ChatSessionModel = mongoose.model("ChatSession", ChatSessionSchema);
export const MessageModel = mongoose.model("Message", MessageSchema);
export const QuizAttemptModel = mongoose.model("QuizAttempt", QuizAttemptSchema);
export const TopicConfidenceModel = mongoose.model("TopicConfidence", TopicConfidenceSchema);

export const AnalyticsModel = mongoose.model("Analytics", AnalyticsSchema);
