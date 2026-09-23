import assert from "node:assert/strict";
import test from "node:test";
import { LearningOutcomeEventModel } from "../models/LearningOutcomeEvent";
import {
  normalizeLearningOutcome,
  recordLearningOutcome,
  stableLearningOutcomeSourceId
} from "./learning-outcome.service";

test("normalizes an outcome and creates a deterministic identity", () => {
  const input = {
    userId: "64f000000000000000000001",
    eventType: "quiz.completed" as const,
    resourceType: "quiz" as const,
    resourceId: "quiz-1",
    source: "arambh" as const,
    sourceEventId: "attempt-1",
    progressPercent: 100,
    outcomeScore: 82,
    competencyIds: ["comp-2", "comp-1", "comp-1"]
  };
  const first = normalizeLearningOutcome(input);
  const second = normalizeLearningOutcome({ ...input, competencyIds: ["comp-1", "comp-2"] });
  assert.equal(first.eventId, second.eventId);
  assert.equal(first.dedupeKey, second.dedupeKey);
  assert.deepEqual(first.competencyIds, ["comp-1", "comp-2"]);
});

test("stable source identity does not depend on object key order", () => {
  assert.equal(
    stableLearningOutcomeSourceId({ b: 2, a: 1 }),
    stableLearningOutcomeSourceId({ a: 1, b: 2 })
  );
});

test("records one outcome for duplicate delivery", async () => {
  const restores: Array<() => void> = [];
  const calls: any[] = [];
  const event = {
    eventId: "loe_existing",
    eventType: "lab.completed",
    userId: "64f000000000000000000001"
  };
  const query = {
    select: () => query,
    lean: async () => event
  };
  const original = LearningOutcomeEventModel.findOneAndUpdate;
  (LearningOutcomeEventModel as any).findOneAndUpdate = async (_filter: unknown, update: any) => {
    calls.push(update);
    return { value: event, lastErrorObject: { updatedExisting: calls.length > 1 } };
  };
  restores.push(() => { (LearningOutcomeEventModel as any).findOneAndUpdate = original; });
  try {
    const input = {
      userId: event.userId,
      eventType: "lab.completed" as const,
      resourceType: "lab" as const,
      resourceId: "lab-1",
      source: "arambh" as const,
      sourceEventId: "completion-1",
      progressPercent: 100,
      outcomeScore: 100
    };
    const first = await recordLearningOutcome(input);
    const second = await recordLearningOutcome(input);
    assert.equal(first.status, "recorded");
    assert.equal(second.status, "already_recorded");
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0].$setOnInsert, calls[1].$setOnInsert);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("handles a concurrent unique-index collision as already recorded", async () => {
  const originalUpdate = LearningOutcomeEventModel.findOneAndUpdate;
  const originalFind = LearningOutcomeEventModel.findOne;
  (LearningOutcomeEventModel as any).findOneAndUpdate = async () => {
    const error: any = new Error("duplicate key");
    error.code = 11000;
    throw error;
  };
  (LearningOutcomeEventModel as any).findOne = () => ({
    select: () => ({
      lean: async () => ({
        eventId: "loe_race_winner",
        eventType: "assessment.completed",
        userId: "64f000000000000000000001"
      })
    })
  });
  try {
    const result = await recordLearningOutcome({
      userId: "64f000000000000000000001",
      eventType: "assessment.completed",
      resourceType: "assessment",
      resourceId: "assessment-1",
      source: "arambh",
      sourceEventId: "assessment-1",
      progressPercent: 100,
      outcomeScore: 75
    });
    assert.equal(result.status, "already_recorded");
    assert.equal(result.eventId, "loe_race_winner");
  } finally {
    (LearningOutcomeEventModel as any).findOneAndUpdate = originalUpdate;
    (LearningOutcomeEventModel as any).findOne = originalFind;
  }
});

test("rejects invalid score, progress, and missing resource identity", async () => {
  await assert.rejects(async () => normalizeLearningOutcome({
    userId: "user-1",
    eventType: "quiz.completed",
    resourceType: "quiz",
    resourceId: "",
    source: "arambh",
    progressPercent: 101,
    outcomeScore: -1
  } as any));
});

test("historical LearningActivity data remains outside outcome normalization", () => {
  const outcome = normalizeLearningOutcome({
    userId: "64f000000000000000000001",
    eventType: "learning.progressed",
    resourceType: "learning_activity",
    resourceId: "lecture-1",
    source: "arambh",
    progressPercent: 40
  });
  assert.equal(outcome.eventType, "learning.progressed");
  assert.equal(outcome.outcomeScore, undefined);
});
