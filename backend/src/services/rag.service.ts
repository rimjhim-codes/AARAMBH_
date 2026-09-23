import { Pinecone } from "@pinecone-database/pinecone";
import { env } from "../config/env";
import { TranscriptModel } from "../models/LearningModels";
import { embedTexts, getEmbeddingStatus } from "./ai/embedding.service";
import {
  formatTimestampLabel,
  parseTimestampSecondsFromQuestion
} from "../utils/timestamp";
import { markUntrustedReference, CONTENT_LIMITS } from "./content-intelligence.contract";

const pinecone = env.pineconeApiKey ? new Pinecone({ apiKey: env.pineconeApiKey }) : null;
let validatedIndexDimension: number | null = null;

export function getRagStatus() {
  const embedding = getEmbeddingStatus();
  if (!embedding.available) {
    return {
      available: false,
      provider: embedding.provider,
      model: embedding.model,
      dimensions: embedding.dimensions,
      pineconeConfigured: Boolean(pinecone && env.pineconeIndex),
      reason: embedding.reason
    };
  }
  if (!pinecone || !env.pineconeIndex) {
    return {
      available: false,
      provider: embedding.provider,
      model: embedding.model,
      dimensions: embedding.dimensions,
      pineconeConfigured: false,
      reason: "Pinecone is not configured for semantic retrieval."
    };
  }
  return {
    available: true,
    provider: embedding.provider,
    model: embedding.model,
    dimensions: embedding.dimensions,
    pineconeConfigured: true,
    namespace: env.pineconeNamespace
  };
}

export async function getVerifiedRagStatus() {
  const status = getRagStatus();
  if (!status.available) return status;
  try {
    await validatePineconeDimension();
    return status;
  } catch (error) {
    return {
      ...status,
      available: false,
      reason: String((error as Error)?.message || error)
    };
  }
}

async function validatePineconeDimension() {
  const status = getRagStatus();
  if (!status.available || !pinecone || !env.pineconeIndex || !status.dimensions) {
    throw new Error(status.reason || "RAG is not configured");
  }
  if (validatedIndexDimension === status.dimensions) return;

  const description = await pinecone.describeIndex(env.pineconeIndex);
  const actualDimension = Number((description as { dimension?: number }).dimension);
  if (!Number.isFinite(actualDimension) || actualDimension !== status.dimensions) {
    throw new Error(
      `PINECONE_DIMENSION_MISMATCH: index=${actualDimension || "unknown"}, embedding=${status.dimensions}`
    );
  }
  validatedIndexDimension = actualDimension;
}

export async function upsertTranscriptChunks(
  lectureId: string,
  chunks: Array<{
    id: string;
    text: string;
    startSec: number;
    endSec: number;
    contentVersion?: string;
    contentHash?: string;
  }>
) {
  const status = getRagStatus();
  if (!status.available || !pinecone) {
    console.warn(`RAG semantic indexing disabled for lecture ${lectureId}: ${status.reason}`);
    return { indexed: false, reason: status.reason };
  }
  await validatePineconeDimension();

  const values = await embedTexts(chunks.map((chunk) => chunk.text));
  const vectors = chunks.map((chunk, index) => ({
    id: chunk.id,
    values: values[index],
    metadata: {
      lectureId,
      text: chunk.text.slice(0, 1000),
      startSec: chunk.startSec,
      endSec: chunk.endSec,
      ...(chunk.contentVersion ? { contentVersion: chunk.contentVersion } : {}),
      ...(chunk.contentHash ? { contentHash: chunk.contentHash } : {})
    }
  }));

  await pinecone.index(env.pineconeIndex).namespace(env.pineconeNamespace).upsert(vectors);
  return { indexed: true, count: vectors.length, provider: status.provider, dimensions: status.dimensions };
}

async function retrieveVectorReferences(
  lectureId: string,
  query: string
) {
  if (!pinecone || !getRagStatus().available) return [];
  await validatePineconeDimension();
  const [queryVector] = await embedTexts([query]);

  const result = await pinecone
    .index(env.pineconeIndex)
    .namespace(env.pineconeNamespace)
    .query({
      vector: queryVector,
      topK: 6,
      includeMetadata: true,
      filter: {
        lectureId: {
          $eq: lectureId
        }
      }
    });

  return (result.matches || []).map((m: any) => ({
    chunkId: m.id ? String(m.id) : undefined,
    text: String(m.metadata?.text || ""),
    startSec: Number(m.metadata?.startSec || 0),
    endSec: Number(m.metadata?.endSec || 0),
    contentVersion: m.metadata?.contentVersion ? String(m.metadata.contentVersion) : undefined,
    contentHash: m.metadata?.contentHash ? String(m.metadata.contentHash) : undefined
  }));
}

async function nearestTranscriptRefs(
  lectureId: string,
  targetSec: number,
  k = 4
) {
  const doc = await TranscriptModel.findOne({ lectureId }).sort({ createdAt: -1 }).lean();

  const chunks = doc?.chunks;

  if (!chunks?.length) return [];

  const scored = chunks.map((c: any) => {
    const mid = (c.startSec + c.endSec) / 2;

    const dist = Math.abs(mid - targetSec);

    const inRange =
      targetSec >= c.startSec &&
      targetSec <= c.endSec
        ? -1
        : 0;

    return {
      ...c,
      dist: dist + inRange * 0.5
    };
  });

  scored.sort((a: any, b: any) => a.dist - b.dist);

  return scored.slice(0, k).map((c: any) => ({
    chunkId: c.embeddingId || c.id || undefined,
    text: c.text,
    startSec: c.startSec,
    endSec: c.endSec,
    contentVersion: c.contentVersion,
    contentHash: c.contentHash
  }));
}

/** Deterministic local fallback used when semantic embeddings are unavailable. */
async function keywordTranscriptRefs(lectureId: string, query: string, k = 6) {
  const doc = await TranscriptModel.findOne({ lectureId }).sort({ createdAt: -1 }).lean();
  const chunks = doc?.chunks || [];
  if (!chunks.length) return [];
  const terms = String(query).toLowerCase().match(/[a-z0-9]{3,}/g) || [];
  const scored = chunks.map((chunk: any, index: number) => {
    const text = String(chunk.text || "").toLowerCase();
    const score = terms.reduce((total, term) => total + (text.includes(term) ? 1 : 0), 0);
    return { ...chunk, score, index };
  }).sort((a: any, b: any) => b.score - a.score || a.index - b.index);
  return scored.slice(0, k).map((chunk: any) => ({
    chunkId: chunk.embeddingId || chunk.chunkId || chunk.id || undefined,
    text: chunk.text,
    startSec: chunk.startSec,
    endSec: chunk.endSec,
    contentVersion: chunk.contentVersion,
    contentHash: chunk.contentHash
  }));
}

function refKey(r: any) {
  return `${r.startSec}:${r.endSec}:${r.text.slice(0, 40)}`;
}

function mergeReferences(primary: any[], secondary: any[]) {
  const seen = new Set();

  const out = [];

  for (const r of [...primary, ...secondary]) {
    const k = refKey(r);

    if (seen.has(k) || !r.text.trim()) continue;

    seen.add(k);

    out.push(r);
  }

  return out.slice(0, 10);
}

export async function retrieveContext(
  lectureId: string,
  question: string
) {
  const boundedQuestion = String(question || "").trim();
  if (!boundedQuestion || boundedQuestion.length > CONTENT_LIMITS.maxQueryChars) {
    throw new Error(`Query must be between 1 and ${CONTENT_LIMITS.maxQueryChars} characters.`);
  }
  const focusTimestampSec =
    parseTimestampSecondsFromQuestion(boundedQuestion);

  const vectorRefs = getRagStatus().available
    ? await retrieveVectorReferences(lectureId, boundedQuestion)
    : [];

  let timeRefs: any[] = [];

  if (focusTimestampSec != null) {
    timeRefs = await nearestTranscriptRefs(
      lectureId,
      focusTimestampSec,
      4
    );
  }

  if (!vectorRefs.length && !timeRefs.length) {
    timeRefs = await keywordTranscriptRefs(lectureId, boundedQuestion, 6);
  }

  const references = mergeReferences(
    timeRefs,
    vectorRefs
  );

  const context = references
    .map(
      (ref) =>
        `[${formatTimestampLabel(
          ref.startSec
        )}–${formatTimestampLabel(
          ref.endSec
        )}]\n${markUntrustedReference(ref.text)}`
    )
    .join("\n\n");

  return {
    context: context.slice(0, CONTENT_LIMITS.maxContextChars),
    references,
    focusTimestampSec
  };
}
