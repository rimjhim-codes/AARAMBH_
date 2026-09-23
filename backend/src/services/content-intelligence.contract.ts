export const CONTENT_LIMITS = { maxChunkChars: 1800, overlapChars: 180, maxQueryChars: 2000, maxTopK: 8, maxContextChars: 12000 } as const;

export const MULTILINGUAL_CONTRACT_VERSION = "6.3.0";

/** Keeps retrieved material visibly separate from executable model instructions. */
export function markUntrustedReference(text: string) {
  return `[BEGIN_UNTRUSTED_REFERENCE]\n${text}\n[END_UNTRUSTED_REFERENCE]`;
}
