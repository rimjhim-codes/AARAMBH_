export type AiTask =
  | "text"
  | "json"
  | "mcq"
  | "summary"
  | "competency"
  | "recommendation"
  | "feedback"
  | "tutor";

export interface AiGenerateInput {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  task?: AiTask;
  system?: string;
}

export interface AiProvider {
  name: string;
  isConfigured(): boolean;
  generateText(input: AiGenerateInput): Promise<string>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public provider: string,
    public code: "quota_exceeded" | "rate_limited" | "invalid_api_key" | "provider_unavailable" | "provider_not_configured" | "timeout" | "unknown_provider_error",
    public failures?: Array<{ provider: string; status: string }>
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export function classifyProviderError(provider: string, status: number, body: string): AiProviderError {
  const lower = body.toLowerCase();
  if (status === 401 || status === 403) {
    return new AiProviderError(`${provider} authentication failed`, provider, "invalid_api_key");
  }
  if (status === 429 && lower.includes("quota") || lower.includes("quota exceeded") || lower.includes("insufficient_quota")) {
    return new AiProviderError(`${provider} quota exceeded`, provider, "quota_exceeded");
  }
  if (status === 429 || lower.includes("rate limit") || lower.includes("too many requests")) {
    return new AiProviderError(`${provider} rate limited`, provider, "rate_limited");
  }
  if (status >= 500 || status === 408) {
    return new AiProviderError(`${provider} unavailable`, provider, "provider_unavailable");
  }
  return new AiProviderError(`${provider} provider error`, provider, "unknown_provider_error");
}

export function extractJsonBlock(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  const arr = trimmed.match(/\[[\s\S]*\]/);
  if (arr) return arr[0];
  const obj = trimmed.match(/\{[\s\S]*\}/);
  if (obj) return obj[0];
  return trimmed;
}
