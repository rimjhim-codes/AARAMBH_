import { createHash } from "node:crypto";
import { z } from "zod";
import {
  LearningOutcomeEventModel,
  LEARNING_OUTCOME_EVENT_TYPES,
  LEARNING_OUTCOME_RESOURCE_TYPES,
  LEARNING_OUTCOME_SOURCES,
  type LearningOutcomeEventType,
  type LearningOutcomeResourceType,
  type LearningOutcomeSource
} from "../models/LearningOutcomeEvent";

const outcomeInputSchema = z.object({
  userId: z.string().min(1),
  eventType: z.enum(LEARNING_OUTCOME_EVENT_TYPES),
  resourceType: z.enum(LEARNING_OUTCOME_RESOURCE_TYPES),
  resourceId: z.string().trim().min(1),
  source: z.enum(LEARNING_OUTCOME_SOURCES),
  sourceEventId: z.string().trim().min(1).optional(),
  occurredAt: z.coerce.date().optional(),
  progressPercent: z.number().min(0).max(100).optional(),
  outcomeScore: z.number().min(0).max(100).optional(),
  competencyIds: z.array(z.string().min(1)).default([]),
  metadata: z.record(z.unknown()).optional(),
  processingVersion: z.string().trim().min(1).max(40).default("1")
});

export type LearningOutcomeInput = z.input<typeof outcomeInputSchema>;

export type LearningOutcomeResult = {
  eventId: string;
  status: "recorded" | "already_recorded";
  eventType: LearningOutcomeEventType;
  userId: string;
};

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) || "null";
}

/** Builds a stable source identifier for retried source deliveries. */
export function stableLearningOutcomeSourceId(value: unknown): string {
  return createHash("sha256").update(stableSerialize(value)).digest("hex");
}

export function normalizeLearningOutcome(input: LearningOutcomeInput) {
  const parsed = outcomeInputSchema.parse(input);
  const competencyIds = [...new Set(parsed.competencyIds.map(String))].sort();
  // Completion callbacks are often normalized more than once during retry
  // handling. Second precision keeps the receipt stable without using time
  // as its identity (the source identity remains deterministic).
  const occurredAt = parsed.occurredAt || new Date(Math.floor(Date.now() / 1000) * 1000);
  const sourceEventId = parsed.sourceEventId || `${parsed.resourceType}:${parsed.resourceId}`;
  const dedupeKey = stableLearningOutcomeSourceId({
    userId: parsed.userId,
    eventType: parsed.eventType,
    resourceType: parsed.resourceType,
    resourceId: parsed.resourceId,
    source: parsed.source,
    sourceEventId
  });
  const eventId = `loe_${dedupeKey}`;

  return {
    ...parsed,
    userId: parsed.userId,
    eventId,
    dedupeKey,
    sourceEventId,
    occurredAt,
    competencyIds,
    metadata: parsed.metadata || {}
  };
}

/**
 * Records exactly one canonical outcome receipt. No competency, gap,
 * recommendation, performance, provider, or external-service work belongs here.
 */
export async function recordLearningOutcome(input: LearningOutcomeInput): Promise<LearningOutcomeResult> {
  const normalized = normalizeLearningOutcome(input);
  try {
    const result = await LearningOutcomeEventModel.findOneAndUpdate(
      { dedupeKey: normalized.dedupeKey },
      {
        $setOnInsert: {
          ...normalized,
          userId: normalized.userId,
          competencyIds: normalized.competencyIds,
          status: "recorded"
        }
      },
      { upsert: true, new: true, rawResult: true }
    ) as any;
    const inserted = Boolean(result?.lastErrorObject?.updatedExisting === false);
    const event = result?.value || result;
    return {
      eventId: String(event?.eventId || normalized.eventId),
      status: inserted ? "recorded" : "already_recorded",
      eventType: normalized.eventType,
      userId: normalized.userId
    };
  } catch (error: any) {
    if (error?.code !== 11000) throw error;
    const existing = await LearningOutcomeEventModel.findOne({ dedupeKey: normalized.dedupeKey }).select("eventId eventType userId").lean();
    if (!existing) throw error;
    return {
      eventId: String(existing.eventId),
      status: "already_recorded",
      eventType: existing.eventType as LearningOutcomeEventType,
      userId: String(existing.userId)
    };
  }
}

export type { LearningOutcomeEventType, LearningOutcomeResourceType, LearningOutcomeSource };
