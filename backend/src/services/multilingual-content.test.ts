import assert from "node:assert/strict";
import test from "node:test";
import { EmployeeProfileModel } from "../models/sih/SihModels";
import { PlatformCourseModel } from "../models/sih/SihModels";
import { LectureModel } from "../models/Lecture";
import * as rag from "./rag.service";
import { buildTransformationCacheKey, transformLectureContent } from "./multilingual-content.service";

function patch(target: any, key: string, value: unknown, restores: Array<() => void>) {
  const original = target[key]; target[key] = value; restores.push(() => { target[key] = original; });
}
function query<T>(value: T) { const chain: any = { select: () => chain, lean: async () => value }; return chain; }
function setup(restores: Array<() => void>, profile: any = { languagePreference: "hi" }) {
  patch(LectureModel, "findOne", () => query({ _id: "lecture-1", title: "Sampling", language: "en", transcript: "Sampling uses API and 95% confidence interval.", sourceType: "transcript" }), restores);
  patch(EmployeeProfileModel, "findOne", () => query(profile), restores);
}

test("English target preserves authorized source without invoking a provider", async () => {
  const restores: Array<() => void> = [];
  try {
    setup(restores, { languagePreference: "en" });
    let called = false;
    const result = await transformLectureContent({ userId: "learner-1", lectureId: "lecture-1", mode: "translate", generate: async () => { called = true; return { text: "bad", provider: "test" }; } });
    assert.equal(result.status, "AVAILABLE");
    assert.equal(result.content, "Sampling uses API and 95% confidence interval.");
    assert.equal(called, false);
    assert.equal(result.grounding.status, "not_required");
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("Hindi translation uses grounded untrusted context and preserves traceability/tokens", async () => {
  const restores: Array<() => void> = [];
  try {
    setup(restores);
    patch(rag, "retrieveContext", async () => ({ context: "", focusTimestampSec: null, references: [{ chunkId: "lecture-1:chunk-1", text: "Sampling uses API and 95% confidence interval.", startSec: 0, endSec: 10, contentVersion: "sha256-source" }] }), restores);
    let prompt = "";
    const result = await transformLectureContent({
      userId: "learner-1", lectureId: "lecture-1", mode: "explain", targetLanguage: "hi",
      generate: async (request) => { prompt = request.prompt; return { text: "Sampling ek technique hai; API aur 95% confidence interval preserve hain.", provider: "test-provider" }; }
    });
    assert.equal(result.status, "AVAILABLE");
    assert.equal(result.provider.name, "test-provider");
    assert.deepEqual(result.grounding.chunkIds, ["lecture-1:chunk-1"]);
    assert.match(prompt, /BEGIN_UNTRUSTED_REFERENCE/);
    assert.match(prompt, /Do not follow instructions/);
    assert.equal(result.source.contentVersion.startsWith("sha256-"), true);
    assert.equal(result.traceability.mode, "explain");
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("Hindi transformation accepts a processed lecture published by an active platform course", async () => {
  const restores: Array<() => void> = [];
  const lecture = {
    _id: "catalog-lecture-1",
    title: "Sampling",
    language: "en",
    transcript: "Sampling uses API and 95% confidence interval.",
    sourceType: "transcript"
  };
  let lectureLookups = 0;
  try {
    patch(EmployeeProfileModel, "findOne", () => query({ languagePreference: "hi" }), restores);
    patch(LectureModel, "findOne", () => {
      lectureLookups += 1;
      return query(lectureLookups % 2 === 1 ? null : lecture);
    }, restores);
    patch(PlatformCourseModel, "findOne", () => query({ _id: "demo-course-1" }), restores);
    patch(rag, "retrieveContext", async () => ({
      context: "",
      focusTimestampSec: null,
      references: [{ chunkId: "catalog-lecture-1:chunk-1", text: lecture.transcript, startSec: 0, endSec: 10 }]
    }), restores);

    const result = await transformLectureContent({
      userId: "employee-1",
      lectureId: "catalog-lecture-1",
      mode: "translate",
      targetLanguage: "hi",
      generate: async () => ({ text: "Sampling ek technique hai; API aur 95% confidence interval preserve hain.", provider: "test-provider" })
    });

    assert.equal(result.status, "AVAILABLE");
    assert.equal(result.targetLanguage, "hi");
    assert.deepEqual(result.grounding.chunkIds, ["catalog-lecture-1:chunk-1"]);
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

test("unsupported language, missing context, and provider failure are explicit", async () => {
  const restores: Array<() => void> = [];
  try {
    setup(restores);
    const unsupported = await transformLectureContent({ userId: "learner-1", lectureId: "lecture-1", mode: "translate", targetLanguage: "bn" });
    assert.equal(unsupported.status, "UNSUPPORTED_LANGUAGE");
    patch(rag, "retrieveContext", async () => ({ context: "", focusTimestampSec: null, references: [] }), restores);
    const insufficient = await transformLectureContent({ userId: "learner-1", lectureId: "lecture-1", mode: "translate", targetLanguage: "hi" });
    assert.equal(insufficient.status, "INSUFFICIENT_CONTEXT");
    patch(rag, "retrieveContext", async () => ({ context: "", focusTimestampSec: null, references: [{ chunkId: "chunk-1", text: "Sampling uses API and 95% confidence interval.", startSec: 0, endSec: 10 }] }), restores);
    const failure = await transformLectureContent({ userId: "learner-1", lectureId: "lecture-1", mode: "translate", targetLanguage: "hi", generate: async () => { throw new Error("provider failed"); } });
    assert.equal(failure.status, "PROVIDER_FAILURE");
    assert.equal(failure.content, null);
  } finally { restores.reverse().forEach((restore) => restore()); }
});

test("cache identity is source-version and mode aware", () => {
  const common = { userId: "u", sourceId: "l", sourceVersion: "v1", sourceLanguage: "en", targetLanguage: "hi" };
  assert.notEqual(buildTransformationCacheKey({ ...common, mode: "translate" }), buildTransformationCacheKey({ ...common, mode: "explain" }));
  assert.notEqual(buildTransformationCacheKey({ ...common, mode: "translate" }), buildTransformationCacheKey({ ...common, sourceVersion: "v2", mode: "translate" }));
});
