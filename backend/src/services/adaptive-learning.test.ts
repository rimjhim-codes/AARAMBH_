import assert from "node:assert/strict";
import test from "node:test";
import { SkillGapModel, LearningRecommendationModel } from "../models/sih/SihModels";
import * as historyService from "./learning-history.service";
import {
  adaptDifficulty,
  buildMasterySignals,
  classifyPerformance,
  chooseAdaptiveAction,
  getNextAdaptiveLearningDecision
} from "./adaptive-learning.service";

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
}

function query(value: unknown) {
  return { sort() { return this; }, limit() { return this; }, lean: async () => value };
}

function evidence(score: number, status = "completed", source = "quiz") {
  return { source, sourceId: `${source}-${score}`, title: `${source} evidence`, status, score, occurredAt: new Date() } as any;
}

test("adaptive performance classification is deterministic across all bands", () => {
  assert.equal(classifyPerformance(buildMasterySignals([])), "insufficient_evidence");
  assert.equal(classifyPerformance(buildMasterySignals([evidence(35), evidence(45)])), "struggling");
  assert.equal(classifyPerformance(buildMasterySignals([evidence(60), evidence(65)])), "developing");
  assert.equal(classifyPerformance(buildMasterySignals([evidence(72), evidence(78)])), "proficient");
  assert.equal(classifyPerformance(buildMasterySignals([evidence(90), evidence(92)])), "strong");
});

test("adaptive actions and difficulty progression avoid unsupported jumps", () => {
  assert.equal(chooseAdaptiveAction("insufficient_evidence", buildMasterySignals([]), true), "review");
  assert.equal(chooseAdaptiveAction("struggling", buildMasterySignals([evidence(40, "failed", "virtual_lab")]), true), "practice");
  assert.equal(chooseAdaptiveAction("developing", buildMasterySignals([evidence(60), evidence(65)]), true), "reassess");
  assert.equal(chooseAdaptiveAction("proficient", buildMasterySignals([evidence(72), evidence(78)]), true), "progress");
  assert.equal(chooseAdaptiveAction("strong", buildMasterySignals([evidence(90), evidence(92)]), true), "challenge");
  assert.equal(adaptDifficulty("beginner", "strong"), "intermediate");
  assert.equal(adaptDifficulty("intermediate", "proficient"), "advanced");
  assert.equal(adaptDifficulty("beginner", "struggling"), "beginner");
  assert.equal(adaptDifficulty(undefined, "strong"), undefined);
});

test("adaptive endpoint decision uses stored recommendations and safe fallback without recalculation", async () => {
  const restores: Array<() => void> = [];
  patch(historyService, "getUnifiedLearningHistory", async () => ({ items: [] }), restores);
  patch(SkillGapModel, "find", () => query([{ competencyId: "competency-1", gap: 2, priority: "high" }]), restores);
  patch(LearningRecommendationModel, "find", () => query([{ _id: "recommendation-1", competencyId: "competency-1", title: "Foundation practice", description: "Review fundamentals", source: "platform", externalId: "course-1", difficulty: "beginner", relevanceScore: 62, reasonSummary: "Addresses the gap" }]), restores);
  try {
    const result = await getNextAdaptiveLearningDecision("64f000000000000000000001");
    assert.equal(result.performanceBand, "insufficient_evidence");
    assert.equal(result.decision, "review");
    assert.equal(result.fallbackUsed, true);
    assert.ok(result.reasonCodes.includes("insufficient_evidence"));
    assert.equal(result.resource?.title, "Foundation practice");
    assert.equal(result.resource?.recommendedDifficulty, "beginner");
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
