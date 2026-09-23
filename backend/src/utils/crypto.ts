import { createHash, randomBytes } from "node:crypto";

export function createResetToken() {
  const raw = randomBytes(32).toString("hex");
  const hash = createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
}

export function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
