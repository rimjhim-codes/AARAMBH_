import assert from "node:assert/strict";
import test from "node:test";
import { normalizeEnrollment, requestJson, IntegrationResponseValidationError } from "./http";
import { IntegrationProviderError } from "./types";
import { SimulatedIgotProvider } from "./igot.provider";
import { SimulatedNsstaProvider } from "./nssta.provider";

const fallback = { id: "fallback", courseId: "course-1" };

test("valid provider enrollment responses are accepted", () => {
  assert.deepEqual(
    normalizeEnrollment({ id: "enrollment-1", status: "enrolled", progressPercent: 0 }, fallback, "iGOT Karmayogi"),
    { id: "enrollment-1", courseId: "course-1", status: "enrolled", progressPercent: 0, completedAt: undefined }
  );
  assert.equal(
    normalizeEnrollment({ data: { enrollmentId: "enrollment-2", status: "completed", progress: 100, programmeId: "programme-1" } }, fallback, "NSSTA TPAC").courseId,
    "programme-1"
  );
});

test("invalid provider enrollment responses are rejected without fallback or clamping", () => {
  const invalidResponses = [
    {},
    { id: "", status: "enrolled", progressPercent: 0 },
    { status: "enrolled", progressPercent: 0 },
    { id: "enrollment", progressPercent: 0 },
    { id: "enrollment", status: "unknown", progressPercent: 0 },
    { id: "enrollment", status: "enrolled", progressPercent: -1 },
    { id: "enrollment", status: "enrolled", progressPercent: 101 },
    { id: "enrollment", status: "enrolled", progressPercent: "50" },
    { id: "enrollment", status: "enrolled", progressPercent: Number.NaN },
    null,
    []
  ];

  for (const response of invalidResponses) {
    assert.throws(
      () => normalizeEnrollment(response, fallback, "iGOT Karmayogi"),
      (error) => error instanceof IntegrationResponseValidationError
    );
  }
});

test("simulated provider enrollment responses remain compatible", async () => {
  const igot = await new SimulatedIgotProvider().enrollCourse({ courseId: "course-1", userId: "user-1" });
  const nssta = await new SimulatedNsstaProvider().enrollCourse({ courseId: "programme-1", userId: "user-1" });
  assert.equal(igot.status, "enrolled");
  assert.equal(nssta.status, "enrolled");
  assert.equal(igot.progressPercent, 0);
  assert.equal(nssta.progressPercent, 0);
});

test("non-2xx provider responses remain request errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("unauthorized", { status: 401 })) as typeof fetch;
  try {
    await assert.rejects(
      () => requestJson("https://provider.invalid/enrollment", {}, 1),
      /HTTP 401/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("429 responses are typed, retried, and honor bounded Retry-After", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return calls === 1
      ? new Response("busy", { status: 429, headers: { "Retry-After": "0" } })
      : new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await requestJson("https://provider.invalid/enrollment", {}, 2, "igot");
    assert.deepEqual(result, { ok: true });
    assert.equal(calls, 2);

    globalThis.fetch = (async () => new Response("busy", {
      status: 429,
      headers: { "Retry-After": "999999" }
    })) as typeof fetch;
    await assert.rejects(
      () => requestJson("https://provider.invalid/enrollment", {}, 1, "nssta"),
      (error) => error instanceof IntegrationProviderError &&
        error.code === "rate_limited" &&
        error.provider === "nssta" &&
        error.retryable &&
        (error.retryAfterMs || 0) <= 5000
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("5xx responses retry while permanent 4xx responses fail immediately", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return calls === 1
      ? new Response("server error", { status: 503 })
      : new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  try {
    await requestJson("https://provider.invalid/enrollment", {}, 2, "igot");
    assert.equal(calls, 2);

    for (const status of [400, 401, 403, 404]) {
      calls = 0;
      globalThis.fetch = (async () => {
        calls += 1;
        return new Response("client error", { status });
      }) as typeof fetch;
      await assert.rejects(
        () => requestJson("https://provider.invalid/enrollment", {}, 3, "nssta"),
        (error) => error instanceof IntegrationProviderError &&
          error.code === "http_error" && error.status === status && !error.retryable
      );
      assert.equal(calls, 1);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("network and timeout failures are typed and retried", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) throw new Error("fetch failed");
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  try {
    await requestJson("https://provider.invalid/enrollment", {}, 2, "igot");
    assert.equal(calls, 2);

    globalThis.fetch = (async () => {
      const error = new Error("request timed out");
      Object.defineProperty(error, "name", { value: "TimeoutError" });
      throw error;
    }) as typeof fetch;
    await assert.rejects(
      () => requestJson("https://provider.invalid/enrollment", {}, 1, "nssta"),
      (error) => error instanceof IntegrationProviderError && error.code === "timeout" && error.provider === "nssta" && error.retryable
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("provider context is preserved for typed HTTP errors", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response("denied", { status: 403 })) as typeof fetch;
  try {
    await assert.rejects(
      () => requestJson("https://provider.invalid/enrollment", {}, 1, "igot"),
      (error) => error instanceof IntegrationProviderError && error.provider === "igot"
    );
    await assert.rejects(
      () => requestJson("https://provider.invalid/enrollment", {}, 1, "nssta"),
      (error) => error instanceof IntegrationProviderError && error.provider === "nssta"
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
