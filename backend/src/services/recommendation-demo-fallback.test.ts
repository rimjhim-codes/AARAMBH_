import assert from "node:assert/strict";
import test from "node:test";
import { env } from "../config/env";
import { PlatformCourseModel } from "../models/sih/SihModels";
import { getDemoLearningPathFallback } from "./recommendation.service";

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key];
  target[key] = value;
  restores.push(() => { target[key] = original; });
}

function query<T>(value: T) {
  const chain: any = {
    select: () => chain,
    limit: () => chain,
    lean: async () => value
  };
  return chain;
}

test("demo learning-path fallback is explicit and does not invent competency claims", async () => {
  const restores: Array<() => void> = [];
  try {
    patch(env, "demoMode", true, restores);
    patch(PlatformCourseModel, "find", (filter: any) => {
      assert.deepEqual(filter, { provider: "ARAMBH Demo Catalog", catalogType: "platform", isActive: true });
      return query([{ code: "DEMO_STATISTICS_FUNDAMENTALS", title: "Statistics Fundamentals", provider: "ARAMBH Demo Catalog" }]);
    }, restores);
    const result = await getDemoLearningPathFallback();
    assert.equal(result.length, 1);
    assert.equal(result[0].demoResource, true);
    assert.deepEqual(result[0].matchedCompetencies, []);
    assert.deepEqual(result[0].solvedGaps, []);
    assert.match(String(result[0].reasonSummary), /not personalized to a competency gap/);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("demo learning-path fallback is disabled outside demo mode", async () => {
  const restores: Array<() => void> = [];
  try {
    patch(env, "demoMode", false, restores);
    assert.deepEqual(await getDemoLearningPathFallback(), []);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});
