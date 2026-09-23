import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { errorHandler } from "./error-handler";

test("validation errors have a stable response shape", () => {
  const result = { statusCode: 0, body: undefined as unknown };
  const res = { status(code: number) { result.statusCode = code; return this; }, json(body: unknown) { result.body = body; return this; } } as any;
  errorHandler(z.object({ required: z.string() }).safeParse({}).error, {} as any, res, (() => {}) as any);
  assert.equal(result.statusCode, 400);
  assert.equal((result.body as any).code, "VALIDATION_ERROR");
  assert.ok(Array.isArray((result.body as any).issues));
});
