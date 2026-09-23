import { Types } from "mongoose";
import {
  LearningOutcomeEventModel,
  type LearningOutcomeEventType
} from "../models/LearningOutcomeEvent";
import {
  applyLabCompetencyImpact,
  applyQuizCompetencyImpact,
  updateCompetencyFromAssessment
} from "./competency.service";
import { generatePersonalizedLearningPath } from "./recommendation.service";
import { recalculatePerformance } from "./performance.service";
import { recalculateSkillGaps } from "./competency.service";
import { getNextAdaptiveLearningDecision } from "./adaptive-learning.service";

export type LearningOutcomeProcessingResult = {
  eventId: string;
  status: "processed" | "already_processed";
  competencyUpdated: boolean;
  skillGapsRefreshed: boolean;
  recommendationsRefreshed: boolean;
  performanceRefreshed: boolean;
};

type OutcomeEvent = {
  eventId: string;
  userId: Types.ObjectId | string;
  eventType: LearningOutcomeEventType;
  resourceType: string;
  resourceId: string;
  source: string;
  outcomeScore?: number;
  competencyIds?: Array<Types.ObjectId | string>;
  metadata?: Record<string, any>;
};

function isValidatedOutcome(event: OutcomeEvent) {
  return ["assessment.completed", "quiz.completed", "lab.completed", "course.completed", "training.completed"].includes(event.eventType);
}

function evidenceKey(eventId: string, competencyId: string) {
  return `outcome:${eventId}:${competencyId}`;
}

async function applyOutcomeEvidence(event: OutcomeEvent) {
  if (!isValidatedOutcome(event) || event.eventType === "learning.progressed") {
    return false;
  }
  if (event.eventType === "course.completed" || event.eventType === "training.completed") {
    return event.metadata?.competencyAlreadyApplied === true;
  }
  const competencyIds = (event.competencyIds || []).map(String);
  if (!competencyIds.length) return false;

  // Assessment completion already applies the locked assessment result before
  // the completion boundary emits its canonical event. The coordinator owns
  // downstream refresh for that event without applying a second score update.
  if (event.metadata?.competencyAlreadyApplied === true) return true;

  for (const competencyId of competencyIds) {
    const key = evidenceKey(event.eventId, competencyId);
    if (event.eventType === "quiz.completed") {
      await applyQuizCompetencyImpact({
        userId: String(event.userId),
        competencyId,
        percentage: Number(event.outcomeScore || 0),
        topic: String(event.metadata?.topic || event.resourceId),
        evidenceKey: key
      });
    } else if (event.eventType === "lab.completed") {
      await applyLabCompetencyImpact({
        userId: String(event.userId),
        competencyId,
        labTitle: String(event.metadata?.labTitle || event.resourceId),
        evidenceKey: key
      });
    } else if (event.eventType === "assessment.completed") {
      const result = (event.metadata?.assessmentResults || []).find((item: any) => String(item.competencyId) === competencyId);
      if (result) {
        await updateCompetencyFromAssessment({
          userId: String(event.userId),
          competencyId,
          assessedLevel: Number(result.assessedLevel),
          accuracy: Number(result.accuracy),
          rationale: String(result.rationale || `Assessment outcome for ${event.resourceId}.`)
        });
      }
    }
  }
  return true;
}

/**
 * Claims and processes one canonical outcome. The atomic claim prevents two
 * requests from running the downstream pipeline concurrently. A failed event
 * remains retryable and is never reported as processed.
 */
export async function processLearningOutcome(eventId: string): Promise<LearningOutcomeProcessingResult> {
  const claimed = await LearningOutcomeEventModel.findOneAndUpdate(
    { eventId, status: { $in: ["recorded", "failed"] } },
    { $set: { status: "processing", processingStartedAt: new Date(), processingError: "" } },
    { new: true }
  ).lean() as any;

  if (!claimed) {
    const existing = await LearningOutcomeEventModel.findOne({ eventId }).select("status eventId").lean() as any;
    if (!existing) throw new Error(`Learning outcome event not found: ${eventId}`);
    return {
      eventId,
      status: "already_processed",
      competencyUpdated: false,
      skillGapsRefreshed: false,
      recommendationsRefreshed: false,
      performanceRefreshed: false
    };
  }

  const event = claimed as OutcomeEvent;
  let competencyUpdated = false;
  try {
    competencyUpdated = await applyOutcomeEvidence(event);
    if (!competencyUpdated) {
      await LearningOutcomeEventModel.findOneAndUpdate(
        { eventId, status: "processing" },
        { $set: {
          status: "processed",
          processedAt: new Date(),
          personalizationTrace: {
            version: "1",
            status: "skipped",
            traceReference: eventId,
            scope: "fallback",
            scopeFallback: true,
            fallbackReason: "missing_competency_mapping",
            affectedCompetencyIds: [],
            affectedResourceIds: event.resourceId ? [String(event.resourceId)] : [],
            gapIds: [],
            recommendationIds: [],
            reason: "no_validated_competency_evidence"
          }
        } }
      );
      return {
        eventId,
        status: "processed",
        competencyUpdated: false,
        skillGapsRefreshed: false,
        recommendationsRefreshed: false,
        performanceRefreshed: false
      };
    }

    const affectedCompetencyIds = [...new Set((event.competencyIds || []).map(String).filter(Boolean))];
    const canScope = affectedCompetencyIds.length > 0;
    const refreshScope = canScope ? { competencyIds: affectedCompetencyIds } : undefined;
    const refreshedGaps = await recalculateSkillGaps(String(event.userId), refreshScope);
    const refreshedRecommendations = await generatePersonalizedLearningPath(String(event.userId), refreshScope);
    await recalculatePerformance(String(event.userId));
    let adaptive: any = null;
    let adaptiveAvailable = true;
    try {
      adaptive = await getNextAdaptiveLearningDecision(String(event.userId), affectedCompetencyIds[0]);
    } catch {
      // Adaptive calculation is read-side personalization. A temporary failure
      // must not roll back a validated outcome or its downstream refresh.
      adaptiveAvailable = false;
    }
    const trace = {
      version: "1",
      status: "updated",
      traceReference: eventId,
      scope: canScope ? "affected" : "fallback",
      scopeFallback: !canScope,
      fallbackReason: canScope ? undefined : "missing_competency_mapping",
      affectedCompetencyIds,
      affectedResourceIds: event.resourceId ? [String(event.resourceId)] : [],
      gapIds: (refreshedGaps || []).slice(0, 50).map((item: any) => String(item._id)).filter(Boolean),
      recommendationIds: (refreshedRecommendations || [])
        .filter((item: any) => !canScope || affectedCompetencyIds.includes(String(item.competencyId)))
        .slice(0, 50)
        .map((item: any) => String(item._id || item.externalId))
        .filter(Boolean),
      adaptiveAvailable,
      adaptive: adaptive ? {
        decision: adaptive.decision,
        performanceBand: adaptive.performanceBand,
        recommendedDifficulty: adaptive.recommendedDifficulty,
        confidence: adaptive.confidence,
        fallbackUsed: adaptive.fallbackUsed,
        resourceId: adaptive.resource?.id
      } : undefined
    };
    await LearningOutcomeEventModel.findOneAndUpdate(
      { eventId, status: "processing" },
      { $set: { status: "processed", processedAt: new Date(), personalizationTrace: trace } }
    );
    return {
      eventId,
      status: "processed",
      competencyUpdated: true,
      skillGapsRefreshed: true,
      recommendationsRefreshed: true,
      performanceRefreshed: true
    };
  } catch (error: any) {
    await LearningOutcomeEventModel.findOneAndUpdate(
      { eventId, status: "processing" },
      { $set: { status: "failed", processingError: String(error?.message || error).slice(0, 1000) } }
    ).catch(() => undefined);
    throw error;
  }
}
