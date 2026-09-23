import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionFrameworkStatus,
  canTransitionSourceStatus,
  isFrameworkEditable,
  LEGACY_FRAMEWORK_ID,
  LEGACY_FRAMEWORK_VERSION,
  LEGACY_SOURCE_ID
} from "./framework.service";
import { INTERNAL_PROFICIENCY_LEVELS } from "../models/sih/SihModels";
import { requiredLevelForGap } from "./competency.service";

test("legacy framework identity is explicit and application-owned", () => {
  assert.equal(LEGACY_FRAMEWORK_ID, "aarambh-application-defined");
  assert.equal(LEGACY_FRAMEWORK_VERSION, "1.0");
  assert.equal(LEGACY_SOURCE_ID, "aarambh-application-defined-source");
  assert.equal(INTERNAL_PROFICIENCY_LEVELS.length, 6);
  assert.deepEqual(INTERNAL_PROFICIENCY_LEVELS.map((level) => level.level), [0, 1, 2, 3, 4, 5]);
});

test("framework lifecycle only moves forward through governance states", () => {
  assert.equal(isFrameworkEditable("draft"), true);
  assert.equal(isFrameworkEditable("review"), true);
  assert.equal(isFrameworkEditable("approved"), false);
  assert.equal(isFrameworkEditable("published"), false);
  assert.equal(canTransitionFrameworkStatus("draft", "review"), true);
  assert.equal(canTransitionFrameworkStatus("review", "approved"), true);
  assert.equal(canTransitionFrameworkStatus("approved", "published"), true);
  assert.equal(canTransitionFrameworkStatus("published", "retired"), true);
  assert.equal(canTransitionFrameworkStatus("published", "draft"), false);
  assert.equal(canTransitionFrameworkStatus("retired", "published"), false);
});

test("source lifecycle requires review before approval and cannot be reopened", () => {
  assert.equal(canTransitionSourceStatus("draft", "pending_review"), true);
  assert.equal(canTransitionSourceStatus("pending_review", "approved"), true);
  assert.equal(canTransitionSourceStatus("approved", "retired"), true);
  assert.equal(canTransitionSourceStatus("draft", "approved"), false);
  assert.equal(canTransitionSourceStatus("retired", "draft"), false);
});

test("unmapped competencies do not receive an artificial level-three requirement", () => {
  assert.equal(requiredLevelForGap(undefined), null);
  assert.equal(requiredLevelForGap(null), null);
  assert.equal(requiredLevelForGap({}), null);
  assert.equal(requiredLevelForGap({ requiredLevel: 4 }), 4);
});
