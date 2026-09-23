import assert from "node:assert/strict";
import test from "node:test";
import { createLabAttempt, getLab, publicLab, sanitizeSubmittedWorkMetadata, startLab, submitLab, validatePythonLabCode, validatePythonLabCodeFallback, validateVirtualLabCategory, validateVirtualLabDefinition } from "./virtual-lab.service";
import { VirtualLabAttemptModel } from "../models/VirtualLabAttempt";
import { VirtualLabAttemptCounterModel } from "../models/VirtualLabAttemptCounter";
import { VirtualLabCompletionModel } from "../models/VirtualLabCompletion";
import { LearningProgressModel } from "../models/LearningProgress";
import { CompetencyModel } from "../models/sih/SihModels";
import { CompetencyScoreModel } from "../models/sih/SihModels";
import * as competencyService from "./competency.service";
import * as outcomeService from "./learning-outcome.service";
import * as coordinatorService from "./learning-outcome-coordinator.service";
import * as performanceService from "./performance.service";

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
}

function query<T>(value: T) {
  return {
    sort() { return this; },
    lean: async () => value,
    then(resolve: (value: T) => unknown, reject?: (error: unknown) => unknown) { return Promise.resolve(value).then(resolve, reject); }
  };
}

test("public lab payload does not expose scenario answers", () => {
  const lab = getLab("cloud-data-pipeline");
  assert.ok(lab);
  const exposed = publicLab(lab!);
  assert.equal(exposed.checkpoints?.[0] && "answer" in exposed.checkpoints[0], false);
  assert.equal(exposed.checkpoints?.[0] && "explanation" in exposed.checkpoints[0], false);
});

test("Python lab accepts computed correct code and rejects hardcoded output", async () => {
  const correct = `import pandas as pd
rows = {"region": ["North", "South", "North", "South"], "value": [10, 20, 30, None]}
df = pd.DataFrame(rows)
df = df.dropna()
result = df.groupby("region")["value"].sum().to_dict()
print(result)`;
  const fake = "print({'North': 40, 'South': 20})";
  assert.equal((await validatePythonLabCode(correct)).passed, true);
  assert.equal((await validatePythonLabCode(fake)).passed, false);
  assert.equal(validatePythonLabCodeFallback(correct).passed, true);
  assert.equal(validatePythonLabCodeFallback(fake).passed, false);
});

test("the next batch is linked to seeded Data Science and Automation competencies", () => {
  const dataScience = getLab("data-science-quality-check");
  const automation = getLab("automation-repeatable-workflow");
  assert.equal(dataScience?.competencyCode, "TECH_DS");
  assert.equal(automation?.competencyCode, "TECH_AUTO");
  assert.equal(dataScience?.checkpoints?.length, 3);
  assert.equal(automation?.checkpoints?.length, 3);
  assert.equal("answer" in publicLab(dataScience!).checkpoints![0], false);
  assert.equal("explanation" in publicLab(automation!).checkpoints![0], false);
});

test("labs expose controlled categories and preserve legacy category-less labs", () => {
  const lab = getLab("cloud-data-pipeline");
  assert.equal(lab?.category, "Cloud Computing");
  const legacy = publicLab({
    id: "legacy-lab",
    title: "Legacy lab",
    type: "scenario",
    competencyCode: "STAT_DQ",
    competency: "Data Quality",
    difficulty: "Beginner",
    minutes: 5,
    description: "Legacy content",
    instructions: [],
    checkpoints: []
  });
  assert.equal((legacy as any).category, undefined);
  assert.equal((legacy as any).title, "Legacy lab");
});

test("runtime lab category validation accepts supported values and rejects unsupported values", () => {
  assert.equal(validateVirtualLabCategory("AI"), "AI");
  assert.equal(validateVirtualLabCategory(undefined), undefined);
  assert.throws(() => validateVirtualLabCategory("Unrestricted Cloud"), /Unsupported virtual lab category/);
  assert.throws(() => validateVirtualLabDefinition({ category: "invalid" } as any), /Unsupported virtual lab category/);
});

test("new lab persistence metadata excludes raw learner submissions", () => {
  const codeMetadata = sanitizeSubmittedWorkMetadata(getLab("python-survey-cleaning")!, {
    code: "print('secret')",
    rawCode: "print('secret')",
    source: "secret source"
  });
  const scenarioMetadata = sanitizeSubmittedWorkMetadata(getLab("cloud-data-pipeline")!, {
    answers: { storage: "Object storage with access policies" },
    rawAnswers: { storage: "secret" }
  });
  for (const metadata of [codeMetadata, scenarioMetadata]) {
    assert.equal("code" in metadata, false);
    assert.equal("answers" in metadata, false);
    assert.equal("rawCode" in metadata, false);
    assert.equal("rawAnswers" in metadata, false);
    assert.equal("source" in metadata, false);
  }
  assert.deepEqual((VirtualLabAttemptModel.schema.path("status") as any).enumValues, ["started", "submitted", "passed", "failed", "abandoned"]);
  assert.equal(VirtualLabCompletionModel.schema.path("submission").instance, "Mixed");
});

test("representative AI and Statistics labs have meaningful constrained criteria", () => {
  const ai = getLab("ai-output-evaluation");
  const statistics = getLab("statistics-sampling-quality");
  assert.equal(ai?.category, "AI");
  assert.equal(statistics?.category, "Statistics");
  assert.ok(ai?.learningObjectives?.length && ai.checkpoints?.length === 3);
  assert.ok(statistics?.learningObjectives?.length && statistics.checkpoints?.length === 3);
  assert.equal(publicLab(ai!).checkpoints?.[0] && "answer" in publicLab(ai!).checkpoints![0], false);
  assert.equal(publicLab(statistics!).checkpoints?.[0] && "answer" in publicLab(statistics!).checkpoints![0], false);
});

test("full lab lifecycle persists failure, retries, completes once, and processes one lab outcome", async () => {
  const restores: Array<() => void> = [];
  const userId = "64f000000000000000000001";
  const attempts: any[] = [];
  const activities: any[] = [];
  const outcomes: any[] = [];
  const processed: string[] = [];
  let canonicalLabOutcomeCount = 0;
  const progress = {
    userId,
    resourceType: "virtual_lab",
    resourceId: "cloud-data-pipeline",
    source: "arambh",
    progressPercent: 0,
    status: "not_started",
    metadata: {},
    save: async function () { return this; }
  } as any;
  const completion = { _id: "completion-1", userId, labId: "cloud-data-pipeline", score: 100, completedAt: new Date() } as any;
  let allocatedAttempt = 0;
  patch(VirtualLabCompletionModel, "findOne", () => query(completion && attempts.some((item) => item.status === "passed") ? completion : null), restores);
  patch(VirtualLabCompletionModel, "create", async (value: any) => { Object.assign(completion, value); return completion; }, restores);
  patch(VirtualLabAttemptModel, "findOne", (filter: any) => {
    if (filter.status === "started") return query(attempts.find((item) => item.status === "started") || null);
    return query(attempts.at(-1) || null);
  }, restores);
  patch(VirtualLabAttemptModel, "create", async (value: any) => {
    const attempt = { _id: `attempt-${value.attemptNumber}`, startedAt: new Date(), ...value, save: async function () { return this; } } as any;
    attempts.push(attempt);
    return attempt;
  }, restores);
  patch(VirtualLabAttemptCounterModel, "findOneAndUpdate", () => query({ nextAttemptNumber: ++allocatedAttempt }), restores);
  patch(LearningProgressModel, "findOne", async () => progress, restores);
  patch(CompetencyModel, "findOne", () => ({ select: () => ({ lean: async () => ({ _id: "competency-1" }) }) }), restores);
  patch(outcomeService, "recordLearningOutcome", async (input: any) => {
    outcomes.push(input);
    if (input.eventType === "lab.completed") canonicalLabOutcomeCount += 1;
    return { eventId: input.eventType === "lab.completed" ? "loe-lab-1" : `loe-progress-${outcomes.length}`, status: canonicalLabOutcomeCount === 1 || input.eventType !== "lab.completed" ? "recorded" : "already_recorded", eventType: input.eventType, userId };
  }, restores);
  patch(coordinatorService, "processLearningOutcome", async (eventId: string) => { if (!processed.includes(eventId)) processed.push(eventId); return { status: processed.length === 1 ? "processed" : "already_processed" }; }, restores);
  patch(performanceService, "recordLearningActivity", async (input: any) => { activities.push(input); }, restores);
  try {
    const started = await startLab(userId, "cloud-data-pipeline");
    assert.equal(started.attempt?.attemptNumber, 1);
    const failed = await submitLab(userId, "cloud-data-pipeline", { answers: {} });
    assert.equal(failed.passed, false);
    assert.equal(failed.attempt.status, "failed");
    assert.equal(attempts.filter((item) => item.status === "failed").length, 1);
    assert.equal(outcomes.some((event) => event.eventType === "lab.completed"), false);
    const succeeded = await submitLab(userId, "cloud-data-pipeline", {
      answers: {
        storage: "Object storage with access policies",
        scale: "An on-demand managed job",
        secrets: "A managed secret store"
      }
    });
    assert.equal(succeeded.passed, true);
    assert.equal(succeeded.attempt.status, "passed");
    assert.equal(attempts.length, 2);
    assert.equal(outcomes.filter((event) => event.eventType === "lab.completed").length, 1);
    assert.deepEqual(processed, ["loe-lab-1"]);
    assert.equal(activities.some((activity) => activity.type === "lab" && activity.meta.status === "passed"), true);
    const duplicate = await submitLab(userId, "cloud-data-pipeline", { answers: {} });
    assert.equal(duplicate.alreadyCompleted, true);
    assert.equal(canonicalLabOutcomeCount, 2, "the service receives the duplicate delivery and must return the existing canonical identity");
    assert.deepEqual(processed, ["loe-lab-1"]);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("lab evidence preserves mapped competency framework metadata", async () => {
  const restores: Array<() => void> = [];
  const updates: any[] = [];
  patch(CompetencyScoreModel, "findOne", async () => null, restores);
  patch(CompetencyModel, "findById", () => ({
    select: () => ({ lean: async () => ({ frameworkId: "framework-4a", frameworkVersionId: "version-2", frameworkVersion: "2.0", proficiencyScale: "internal_0_5" }) })
  }), restores);
  patch(CompetencyScoreModel, "findOneAndUpdate", async (_filter: any, update: any) => { updates.push(update); return update; }, restores);
  try {
    await competencyService.applyLabCompetencyImpact({
      userId: "64f000000000000000000001",
      competencyId: "64f000000000000000000101",
      labTitle: "AI output evaluation",
      evidenceKey: "outcome:lab-1:competency-1"
    });
    assert.equal(updates[0].frameworkId, "framework-4a");
    assert.equal(updates[0].frameworkVersion, "2.0");
    assert.equal(updates[0].frameworkVersionId, "version-2");
    assert.equal(updates[0].proficiencyScale, "internal_0_5");
    assert.equal(updates[0].$push.evidence.type, "lab");
    assert.equal(updates[0].$push.evidence.key, "outcome:lab-1:competency-1");
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("atomic counter allocation gives concurrent starts unique attempt numbers", async () => {
  const restores: Array<() => void> = [];
  let counter = 0;
  const created: any[] = [];
  patch(VirtualLabAttemptModel, "findOne", () => query(null), restores);
  patch(VirtualLabAttemptCounterModel, "findOneAndUpdate", () => query({ nextAttemptNumber: ++counter }), restores);
  patch(VirtualLabAttemptModel, "create", async (value: any) => { created.push(value); return value; }, restores);
  try {
    await Promise.all([
      createLabAttempt("64f000000000000000000001", "cloud-data-pipeline"),
      createLabAttempt("64f000000000000000000001", "cloud-data-pipeline"),
      createLabAttempt("64f000000000000000000001", "cloud-data-pipeline")
    ]);
    assert.deepEqual(created.map((item) => item.attemptNumber).sort((a, b) => a - b), [1, 2, 3]);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
