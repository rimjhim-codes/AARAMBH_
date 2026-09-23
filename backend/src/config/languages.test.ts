import assert from "node:assert/strict";
import test from "node:test";
import { SUPPORTED_LANGUAGES } from "./languages";

test("language catalogue contains English plus all 22 scheduled languages", () => {
  assert.equal(SUPPORTED_LANGUAGES.length, 23);
  assert.equal(new Set(SUPPORTED_LANGUAGES.map((language) => language.code)).size, 23);
  assert.equal(SUPPORTED_LANGUAGES.filter((language) => language.tier === 1).length, 11);
  assert.equal(SUPPORTED_LANGUAGES.filter((language) => language.tier === 2).length, 12);
  assert.ok(SUPPORTED_LANGUAGES.some((language) => language.name === "Santali" && language.code === "sat"));
  assert.ok(SUPPORTED_LANGUAGES.some((language) => language.name === "Dogri" && language.code === "doi"));
});
