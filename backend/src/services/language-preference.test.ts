import assert from "node:assert/strict";
import test from "node:test";
import { EmployeeProfileModel } from "../models/sih/SihModels";
import { createLanguageContext, LANGUAGE_REGISTRY, normalizeLanguageCode, resolveLanguagePreference } from "../config/languages";
import { getLearnerLanguagePreference, UnsupportedLanguageError, updateLearnerLanguagePreference } from "./language-preference.service";

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key]; target[key] = value; restores.push(() => { target[key] = original; });
}
function query<T>(value: T) { const chain: any = { select: () => chain, lean: async () => value }; return chain; }

test("language registry exposes only English and Hindi as selectable production languages", () => {
  assert.deepEqual(LANGUAGE_REGISTRY.filter((language) => language.enabled).map((language) => language.code), ["en", "hi"]);
  assert.equal(resolveLanguagePreference().code, "en");
  assert.equal(normalizeLanguageCode("English"), "en");
  assert.equal(normalizeLanguageCode("unknown"), "en");
  assert.equal(createLanguageContext("hi").locale, "hi-IN");
  assert.equal(createLanguageContext("bn").requestedLanguage, "en");
});

test("missing and legacy learner preferences safely resolve to English or the persisted supported language", async () => {
  const restores: Array<() => void> = [];
  try {
    patch(EmployeeProfileModel, "findOne", () => query({ languagePreference: "English" }), restores);
    assert.equal((await getLearnerLanguagePreference("learner-1")).preference.code, "en");
    patch(EmployeeProfileModel, "findOne", () => query({}), restores);
    assert.equal((await getLearnerLanguagePreference("learner-2")).preference.code, "en");
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("preference update is learner-scoped and rejects unsupported or arbitrary values", async () => {
  const restores: Array<() => void> = []; let updateFilter: any;
  try {
    patch(EmployeeProfileModel, "findOneAndUpdate", (filter: any) => { updateFilter = filter; return query({ languagePreference: "hi" }); }, restores);
    const result = await updateLearnerLanguagePreference("learner-1", "hi");
    assert.equal(result.preference.code, "hi");
    assert.deepEqual(updateFilter, { userId: "learner-1" });
    await assert.rejects(() => updateLearnerLanguagePreference("learner-1", "bn"), UnsupportedLanguageError);
    await assert.rejects(() => updateLearnerLanguagePreference("other-user", "user-2"), UnsupportedLanguageError);
  } finally { restores.reverse().forEach((restore) => restore()); }
});
