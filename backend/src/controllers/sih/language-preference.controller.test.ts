import assert from "node:assert/strict";
import test from "node:test";
import * as languageService from "../../services/language-preference.service";
import { getMyLanguagePreference, updateMyLanguagePreference } from "./language-preference.controller";

function response() { return { body: undefined as unknown, json(body: unknown) { this.body = body; return this; } }; }
function request(body: unknown = {}) { return { user: { id: "learner-1" }, body } as any; }

test("language preference controller always uses authenticated identity", async () => {
  const restores: Array<() => void> = []; const original = languageService.updateLearnerLanguagePreference;
  let received: unknown[] = [];
  (languageService as any).updateLearnerLanguagePreference = async (...args: unknown[]) => { received = args; return { preference: { code: "hi" } }; };
  restores.push(() => { (languageService as any).updateLearnerLanguagePreference = original; });
  try {
    const res = response(); await updateMyLanguagePreference(request({ languageCode: "hi" }), res as any);
    assert.deepEqual(received, ["learner-1", "hi"]);
    assert.deepEqual(res.body, { preference: { code: "hi" } });
    await assert.rejects(() => updateMyLanguagePreference(request({ languageCode: "hi", userId: "other-user" }), res as any));
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("language preference controller returns the normalized read contract", async () => {
  const restores: Array<() => void> = []; const original = languageService.getLearnerLanguagePreference;
  (languageService as any).getLearnerLanguagePreference = async (userId: string) => ({ userId, preference: { code: "en" }, availableLanguages: [] });
  restores.push(() => { (languageService as any).getLearnerLanguagePreference = original; });
  try { const res = response(); await getMyLanguagePreference(request(), res as any); assert.deepEqual(res.body, { userId: "learner-1", preference: { code: "en" }, availableLanguages: [] }); }
  finally { restores.reverse().forEach((restore) => restore()); }
});
