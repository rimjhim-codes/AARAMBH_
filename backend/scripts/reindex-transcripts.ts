import "dotenv/config";
import mongoose from "mongoose";
import { Pinecone } from "@pinecone-database/pinecone";
import { connectDb } from "../src/config/db";
import { env } from "../src/config/env";
import { TranscriptModel } from "../src/models/LearningModels";
import { getVerifiedRagStatus, upsertTranscriptChunks } from "../src/services/rag.service";

/**
 * One-time destructive migration from the former mock-vector index.
 * The explicit flag is required because deleteAll removes every vector in the
 * configured namespace before rebuilding it from MongoDB transcript chunks.
 */
async function main() {
  if (!process.argv.includes("--confirm-delete")) {
    throw new Error("Refusing to run: pass --confirm-delete to clear and rebuild the Pinecone namespace.");
  }

  await connectDb();
  const status = await getVerifiedRagStatus();
  if (!status.available || !env.pineconeApiKey || !env.pineconeIndex) {
    throw new Error(`RAG is not ready: ${status.reason || "missing Pinecone configuration"}`);
  }

  const pinecone = new Pinecone({ apiKey: env.pineconeApiKey });
  const namespace = pinecone.index(env.pineconeIndex).namespace(env.pineconeNamespace);
  console.warn(`Deleting all vectors from Pinecone namespace '${env.pineconeNamespace}' before re-indexing.`);
  await namespace.deleteAll();

  const transcripts = await TranscriptModel.find().lean();
  let indexedChunks = 0;
  for (const transcript of transcripts) {
    const chunks = (transcript.chunks || []).map((chunk: any, index: number) => ({
      id: chunk.embeddingId || `${transcript.lectureId}-${index}`,
      text: String(chunk.text || ""),
      startSec: Number(chunk.startSec || 0),
      endSec: Number(chunk.endSec || 0)
    })).filter((chunk) => chunk.text.trim());

    if (!chunks.length) continue;
    const result = await upsertTranscriptChunks(String(transcript.lectureId), chunks);
    indexedChunks += result.count || 0;
    console.log(`Re-indexed lecture ${transcript.lectureId}: ${result.count || 0} chunks.`);
  }

  console.log(`Transcript re-index complete: ${transcripts.length} transcripts, ${indexedChunks} chunks.`);
  await mongoose.disconnect();
  process.exitCode = 0;
}

main().catch((error) => {
  console.error("Transcript re-index failed:", error);
  mongoose.disconnect().catch(() => undefined);
  process.exitCode = 1;
});
