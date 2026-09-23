import assert from "node:assert/strict";
import test from "node:test";
import { setNoStoreHeaders } from "./auth.controller";

test("auth session responses receive no-store headers", () => {
  const headers = new Map<string, string>();
  setNoStoreHeaders({
    setHeader: (name: string, value: string | number | readonly string[]) => headers.set(name, String(value))
  } as any);
  assert.equal(headers.get("Cache-Control"), "no-store, no-cache, must-revalidate");
  assert.equal(headers.get("Pragma"), "no-cache");
});
