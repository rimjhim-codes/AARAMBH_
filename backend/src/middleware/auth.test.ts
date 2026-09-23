import assert from "node:assert/strict";
import test from "node:test";
import { authenticateSocket, canJoinUserRoom } from "./auth";

test("socket handshake without a token is rejected", async () => {
  let error: Error | undefined;
  await authenticateSocket({ handshake: { headers: {} }, data: {} }, (value) => { error = value; });
  assert.equal(error?.message, "Unauthorized");
});

test("socket user rooms are restricted to the authenticated user", () => {
  assert.equal(canJoinUserRoom("user-a", "user-a"), true);
  assert.equal(canJoinUserRoom("user-a", "user-b"), false);
});
