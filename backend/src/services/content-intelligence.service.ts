import { createHash } from "node:crypto";
import { LectureModel } from "../models/Lecture";
import { PlatformCourseModel } from "../models/sih/SihModels";
import { createLanguageContext, normalizeLanguageCode, type LanguageCode } from "../config/languages";
import { getEmbeddingStatus, embedTexts } from "./ai/embedding.service";
import { getRagStatus, retrieveContext } from "./rag.service";
import { CONTENT_LIMITS } from "./content-intelligence.contract";

export type ContentSourceType = "platform_course" | "lecture" | "learning_material" | "uploaded_document" | "igot" | "nssta" | "training" | "youtube";
export type ContentSource = { sourceType: ContentSourceType; sourceId: string; title: string; originalLanguage: LanguageCode; provider?: string; sourceUrl?: string; contentVersion: string; contentHash: string; ingestedAt: string; metadata?: Record<string, string> };
export type ContentChunk = { chunkId: string; sourceId: string; sourceType: ContentSourceType; contentVersion: string; text: string; heading?: string; page?: number; slide?: number; sequence: number; contentHash: string; language: LanguageCode; provider?: string };
export type GroundedContext = { query: string; sourceLanguage: LanguageCode; requestedLanguage: LanguageCode; retrievedContext: Array<{ sourceId: string; sourceType: ContentSourceType; title: string; chunkId?: string; text: string; location: { heading?: string; page?: number; slide?: number; sequence?: number }; relevance?: number; version: string; provider?: string }>; contextSufficient: boolean; limitations: string[] };

export function normalizeExtractedText(value: string) {
  return String(value || "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.replace(/[ \t]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}
export function contentHash(value: string) { return createHash("sha256").update(normalizeExtractedText(value), "utf8").digest("hex"); }
export function contentVersion(value: string) { return `sha256-${contentHash(value).slice(0, 16)}`; }
export function hasContentChanged(previousHash: string | undefined, value: string) { return Boolean(previousHash) && previousHash !== contentHash(value); }
export function buildContentSource(input: { sourceType: ContentSourceType; sourceId: string; title: string; text: string; language?: string; provider?: string; sourceUrl?: string; ingestedAt?: Date | string; metadata?: Record<string, string> }): ContentSource {
  return { sourceType: input.sourceType, sourceId: input.sourceId, title: input.title, originalLanguage: normalizeLanguageCode(input.language), provider: input.provider, sourceUrl: input.sourceUrl, contentVersion: contentVersion(input.text), contentHash: contentHash(input.text), ingestedAt: new Date(input.ingestedAt || Date.now()).toISOString(), metadata: input.metadata };
}

function headingFor(line: string) { return /^(?:#{1,6}\s+|chapter\b|lesson\b|section\b|unit\b|module\b|slide\b)/i.test(line.trim()) ? line.trim().replace(/^#+\s*/, "") : undefined; }
export function chunkContent(text: string, options: { sourceId: string; sourceType?: ContentSourceType; title?: string; language?: string; provider?: string; maxChunkChars?: number } ): ContentChunk[] {
  const normalized = normalizeExtractedText(text); if (!normalized) throw new Error("Content is empty after normalization.");
  const source = buildContentSource({ sourceType: options.sourceType || "lecture", sourceId: options.sourceId, title: options.title || "Untitled content", text: normalized, language: options.language, provider: options.provider });
  const max = Math.max(200, Math.min(options.maxChunkChars || CONTENT_LIMITS.maxChunkChars, CONTENT_LIMITS.maxChunkChars));
  const units = normalized.split(/\n{2,}/).map((unit) => unit.trim()).filter(Boolean); const chunks: ContentChunk[] = []; let current = ""; let heading: string | undefined;
  const flush = () => { if (!current.trim()) return; const sequence = chunks.length; const value = current.trim(); chunks.push({ chunkId: `${source.sourceId}:${source.contentVersion}:${sequence}`, sourceId: source.sourceId, sourceType: source.sourceType, contentVersion: source.contentVersion, text: value, heading, sequence, contentHash: contentHash(value), language: source.originalLanguage, provider: source.provider }); current = ""; };
  for (const unit of units) { const nextHeading = headingFor(unit.split("\n")[0] || ""); if (nextHeading && current) flush(); if (nextHeading) heading = nextHeading; if (current && current.length + unit.length + 2 > max) flush(); if (unit.length <= max) current = current ? `${current}\n\n${unit}` : unit; else { for (let start = 0; start < unit.length; start += max - CONTENT_LIMITS.overlapChars) { const part = unit.slice(start, start + max).trim(); if (part) { if (current) flush(); current = part; flush(); } } } }
  flush(); return chunks;
}

export function getContentIntelligenceStatus() { const embedding = getEmbeddingStatus(); const rag = getRagStatus(); return { embedding: { available: embedding.available, provider: embedding.provider, model: embedding.model, dimensions: embedding.dimensions }, retrieval: { available: rag.available, provider: rag.provider, model: rag.model, dimensions: rag.dimensions, pineconeConfigured: rag.pineconeConfigured, reason: rag.reason || null } }; }
export async function embedContentChunks(chunks: ContentChunk[]) { if (!chunks.length) return []; const vectors = await embedTexts(chunks.map((chunk) => chunk.text)); const status = getEmbeddingStatus(); return chunks.map((chunk, index) => ({ chunkId: chunk.chunkId, contentHash: chunk.contentHash, values: vectors[index], provider: status.provider, model: status.model, dimensions: status.dimensions, contentVersion: chunk.contentVersion })); }

export async function retrieveLectureGroundedContext(input: { userId: string; lectureId: string; query: string; requestedLanguage?: string; topK?: number }): Promise<GroundedContext> {
  const query = String(input.query || "").trim(); if (!query || query.length > CONTENT_LIMITS.maxQueryChars) throw new Error(`Query must be between 1 and ${CONTENT_LIMITS.maxQueryChars} characters.`);
  let lecture = await LectureModel.findOne({ _id: input.lectureId, userId: input.userId }).select("_id title sourceType language sourceUrl transcript").lean();
  if (!lecture) {
    const catalogCourse = await PlatformCourseModel.findOne({ lectureIds: input.lectureId, catalogType: "platform", isActive: true }).select("_id").lean();
    if (catalogCourse) lecture = await LectureModel.findOne({ _id: input.lectureId, status: "processed" }).select("_id title sourceType language sourceUrl transcript").lean();
  }
  if (!lecture) throw new Error("Content source not found.");
  const source = buildContentSource({ sourceType: lecture.sourceType === "youtube" ? "youtube" : "lecture", sourceId: String(lecture._id), title: lecture.title, text: lecture.transcript, language: lecture.language, sourceUrl: lecture.sourceUrl });
  let retrieved: { references: any[] };
  try { retrieved = await retrieveContext(String(lecture._id), query); } catch { return { query, sourceLanguage: source.originalLanguage, requestedLanguage: createLanguageContext(lecture.language, input.requestedLanguage).requestedLanguage, retrievedContext: [], contextSufficient: false, limitations: ["retrieval_failed"] }; }
  const max = Math.min(Math.max(input.topK || 6, 1), CONTENT_LIMITS.maxTopK); const seen = new Set<string>(); let total = 0; const limitations: string[] = [];
  const contextItems = retrieved.references.slice(0, max).map((reference: any, index: number) => { const text = normalizeExtractedText(reference.text); const key = contentHash(text); if (!text || seen.has(key) || total >= CONTENT_LIMITS.maxContextChars) return null; const bounded = text.slice(0, Math.max(0, CONTENT_LIMITS.maxContextChars - total)); if (!bounded) return null; seen.add(key); total += bounded.length; const version = reference.contentVersion || source.contentVersion; if (!reference.contentVersion) limitations.push("content_version_not_confirmed"); if (!reference.chunkId) limitations.push("chunk_reference_unavailable"); return { sourceId: source.sourceId, sourceType: source.sourceType, title: source.title, chunkId: reference.chunkId || undefined, text: bounded, location: { sequence: index, ...(reference.startSec != null ? { heading: `${reference.startSec}-${reference.endSec}s` } : {}) }, version, provider: source.provider }; }).filter(Boolean) as GroundedContext["retrievedContext"];
  if (!getRagStatus().available) limitations.push("semantic_retrieval_unavailable"); if (!contextItems.length) limitations.push("insufficient_context"); return { query, sourceLanguage: source.originalLanguage, requestedLanguage: createLanguageContext(lecture.language, input.requestedLanguage).requestedLanguage, retrievedContext: contextItems, contextSufficient: contextItems.length > 0, limitations: [...new Set(limitations)] };
}
