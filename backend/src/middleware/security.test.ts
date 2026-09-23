import assert from "node:assert/strict";
import test from "node:test";
import { securityHeaders } from "./security";

test("security headers are set on API responses", () => {
  const headers = new Map<string, string>();
  const res = { setHeader: (name: string, value: string) => headers.set(name, value) } as any;
  let continued = false;
  securityHeaders({} as any, res, () => { continued = true; });
  assert.equal(continued, true);
  assert.equal(headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headers.get("X-Frame-Options"), "DENY");
  assert.equal(headers.get("Referrer-Policy"), "no-referrer");
});
