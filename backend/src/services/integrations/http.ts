import { ExternalEnrollment, IntegrationProviderError } from "./types";
import { z } from "zod";

export async function requestJson(
  url: string,
  init: RequestInit,
  attempts = 3,
  provider = "external"
): Promise<Record<string, any>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      const body = await response.text();
      let parsed: Record<string, any> = {};
      try {
        parsed = body ? JSON.parse(body) : {};
      } catch {
        parsed = { raw: body };
      }
      if (!response.ok) {
        if (response.status === 429) {
          throw new IntegrationProviderError(
            `${provider} provider rate limit exceeded.`,
            provider,
            "rate_limited",
            429,
            true,
            parseRetryAfter(response.headers.get("retry-after"))
          );
        }
        throw new IntegrationProviderError(
          `${provider} provider returned HTTP ${response.status}.`,
          provider,
          "http_error",
          response.status,
          response.status >= 500
        );
      }
      return parsed;
    } catch (error) {
      lastError = error;
      const normalized = normalizeTransportError(error, provider);
      lastError = normalized;
      if (!normalized.retryable || attempt >= attempts) throw normalized;
      const delay = normalized.retryAfterMs ?? 250 * attempt;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const MAX_RETRY_AFTER_MS = 5000;

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value.trim())) {
    return Math.min(MAX_RETRY_AFTER_MS, Number(value.trim()) * 1000);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return undefined;
  return Math.min(MAX_RETRY_AFTER_MS, Math.max(0, timestamp - Date.now()));
}

function normalizeTransportError(error: unknown, provider: string): IntegrationProviderError {
  if (error instanceof IntegrationProviderError) return error;
  const candidate = error as { name?: string; message?: string };
  const message = candidate?.message || String(error);
  const timeout = candidate?.name === "AbortError" || candidate?.name === "TimeoutError" || /timeout|timed out|aborted/i.test(message);
  return new IntegrationProviderError(
    timeout ? `${provider} provider request timed out.` : `${provider} provider network request failed.`,
    provider,
    timeout ? "timeout" : "network_error",
    undefined,
    true
  );
}

export function replacePath(path: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replace(`{${key}}`, encodeURIComponent(value)),
    path
  );
}

export class IntegrationResponseValidationError extends Error {
  readonly code = "invalid_provider_response";

  constructor(provider: string) {
    super(`${provider} returned an invalid enrollment response.`);
    this.name = "IntegrationResponseValidationError";
  }
}

const enrollmentResponseSchema = z.object({
  id: z.string().trim().min(1),
  status: z.enum(["enrolled", "in_progress", "completed"]),
  progressPercent: z.number().finite().min(0).max(100)
});

export function normalizeEnrollment(
  raw: unknown,
  fallback: { id: string; courseId: string },
  provider = "External provider"
): ExternalEnrollment {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new IntegrationResponseValidationError(provider);
  }

  const envelope = raw as Record<string, unknown>;
  const candidate = envelope.enrollment ?? envelope.data ?? envelope;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    throw new IntegrationResponseValidationError(provider);
  }

  const value = candidate as Record<string, unknown>;
  const parsed = enrollmentResponseSchema.safeParse({
    id: value.id ?? value.enrollmentId,
    status: value.status,
    progressPercent: value.progressPercent ?? value.progress
  });
  if (!parsed.success) {
    throw new IntegrationResponseValidationError(provider);
  }

  return {
    ...parsed.data,
    courseId: typeof value.courseId === "string" && value.courseId.trim()
      ? value.courseId
      : typeof value.programmeId === "string" && value.programmeId.trim()
        ? value.programmeId
        : fallback.courseId,
    completedAt: typeof value.completedAt === "string" ? value.completedAt : undefined
  };
}
