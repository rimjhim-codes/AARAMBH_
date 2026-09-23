import assert from "node:assert/strict";
import test from "node:test";
import { LearningProgressModel } from "../models/LearningProgress";
import * as outcomeService from "./learning-outcome.service";
import * as coordinator from "./learning-outcome-coordinator.service";
import * as performanceService from "./performance.service";
import { recordExternalProgressOutcome, updateLectureProgress, upsertLearningProgress } from "./learning-progress.service";

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
}

function progressDoc(overrides: Record<string, unknown> = {}) {
  return {
    userId: "64f000000000000000000001",
    resourceType: "lecture",
    resourceId: "lecture-1",
    source: "arambh",
    progressPercent: 0,
    status: "not_started",
    metadata: {},
    save: async function () { return this; },
    ...overrides
  } as any;
}

test("lecture progress is monotonic and emits learning.progressed without coordinator work", async () => {
  const restores: Array<() => void> = [];
  const events: any[] = [];
  let coordinatorCalls = 0;
  const doc = progressDoc();
  patch(LearningProgressModel, "findOne", async () => doc, restores);
  patch(outcomeService, "recordLearningOutcome", async (input: any) => { events.push(input); return { eventId: "loe-progress", status: "recorded", eventType: input.eventType, userId: input.userId }; }, restores);
  patch(coordinator, "processLearningOutcome", async () => { coordinatorCalls += 1; throw new Error("must not process progress-only events"); }, restores);
  patch(performanceService, "recordLearningActivity", async () => ({}), restores);
  try {
    const result = await updateLectureProgress({
      userId: "64f000000000000000000001",
      resourceId: "lecture-1",
      source: "arambh",
      progressPercent: 35
    });
    assert.equal(result.progress.progressPercent, 35);
    assert.equal(events[0].eventType, "learning.progressed");
    assert.equal(coordinatorCalls, 0);
    await assert.rejects(() => upsertLearningProgress({
      userId: "64f000000000000000000001",
      resourceType: "lecture",
      resourceId: "lecture-1",
      source: "arambh",
      progressPercent: 20
    }), /cannot decrease/);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("validated external completion is mapped once to the central coordinator", async () => {
  const restores: Array<() => void> = [];
  const events: any[] = [];
  const processed: string[] = [];
  const doc = progressDoc({ resourceType: "igot_course", resourceId: "course-1", source: "igot", status: "in_progress", progressPercent: 40 });
  patch(LearningProgressModel, "findOne", async () => doc, restores);
  patch(outcomeService, "recordLearningOutcome", async (input: any) => { events.push(input); return { eventId: "loe-course", status: "recorded", eventType: input.eventType, userId: input.userId }; }, restores);
  patch(coordinator, "processLearningOutcome", async (eventId: string) => { processed.push(eventId); return {} as any; }, restores);
  patch(performanceService, "recordLearningActivity", async () => ({}), restores);
  try {
    const result = await recordExternalProgressOutcome({
      userId: "64f000000000000000000001",
      resourceType: "igot_course",
      resourceId: "course-1",
      source: "igot",
      progressPercent: 100,
      status: "completed"
    });
    assert.equal(events.at(-1).eventType, "course.completed");
    assert.equal(events.at(-1).metadata.competencyAlreadyApplied, undefined);
    assert.deepEqual(processed, ["loe-course"]);
    assert.equal(result.progress?.status, "completed");
    assert.equal(result.progress?.completedOutcomeEventId, "loe-course");
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("invalid progress is rejected before persistence", async () => {
  await assert.rejects(() => upsertLearningProgress({
    userId: "64f000000000000000000001",
    resourceType: "learning_material",
    resourceId: "material-1",
    source: "arambh",
    progressPercent: 101
  }), /between 0 and 100/);
});
