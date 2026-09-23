import { env } from "../../config/env";
import { AiProviderError, classifyProviderError } from "./types";

export type EmbeddingProviderName = "openai" | "mistral" | "gemini";

export type EmbeddingStatus = {
  available: boolean;
  provider: EmbeddingProviderName | null;
  model: string | null;
  dimensions: number | null;
  reason?: string;
};

function configuredProvider(): EmbeddingProviderName | null {
  const requested = env.embeddingsProvider.toLowerCase();
  const order = [requested, "openai", "mistral", "gemini"];
  for (const name of order) {
    if (name === "openai" && env.openAiApiKey) return "openai";
    if (name === "mistral" && env.mistralApiKey) return "mistral";
    if (name === "gemini" && env.geminiApiKey) return "gemini";
  }
  return null;
}

function modelAndDimensions(provider: EmbeddingProviderName) {
  if (provider === "openai") {
    return {
      model: env.openAiEmbeddingModel,
      dimensions: env.openAiEmbeddingDimensions || 1536
    };
  }
  if (provider === "mistral") {
    return { model: env.mistralEmbeddingModel, dimensions: 1024 };
  }
  return {
    model: env.geminiEmbeddingModel,
    dimensions: env.geminiEmbeddingDimensions
  };
}

export function getEmbeddingStatus(): EmbeddingStatus {
  if (!env.embeddingsEnabled) {
    return {
      available: false,
      provider: null,
      model: null,
      dimensions: null,
      reason: "Embeddings are disabled by EMBEDDINGS_ENABLED=false."
    };
  }
  const provider = configuredProvider();
  if (!provider) {
    return {
      available: false,
      provider: null,
      model: null,
      dimensions: null,
      reason: "No configured embedding provider key was found."
    };
  }
  const config = modelAndDimensions(provider);
  return { available: true, provider, ...config };
}

export function getEmbeddingDimension(): number | null {
  return getEmbeddingStatus().dimensions;
}

async function postEmbeddingRequest(
  provider: EmbeddingProviderName,
  texts: string[]
): Promise<number[][]> {
  const config = modelAndDimensions(provider);
  let url = "";
  let body: Record<string, unknown>;
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (provider === "openai") {
    url = "https://api.openai.com/v1/embeddings";
    headers.Authorization = `Bearer ${env.openAiApiKey}`;
    body = { model: config.model, input: texts, dimensions: env.openAiEmbeddingDimensions };
  } else if (provider === "mistral") {
    url = "https://api.mistral.ai/v1/embeddings";
    headers.Authorization = `Bearer ${env.mistralApiKey}`;
    body = { model: config.model, input: texts };
  } else {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:batchEmbedContents?key=${env.geminiApiKey}`;
    body = {
      requests: texts.map((text) => ({
        model: `models/${config.model}`,
        content: { parts: [{ text }] },
        outputDimensionality: config.dimensions
      }))
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), env.aiRequestTimeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) {
      const responseBody = await response.text();
      if (provider === "mistral") {
        console.error("[Mistral embedding request failed]", {
          status: response.status,
          model: config.model,
          body: responseBody.slice(0, 4000)
        });
      }
      throw classifyProviderError(provider, response.status, responseBody);
    }

    const data = (await response.json()) as {
      data?: Array<{ embedding?: number[] }>;
      embeddings?: Array<{ values?: number[] }>;
    };
    const vectors = provider === "gemini"
      ? (data.embeddings || []).map((item) => item.values || [])
      : (data.data || []).map((item) => item.embedding || []);
    if (vectors.length !== texts.length || vectors.some((vector) => vector.length !== config.dimensions)) {
      throw new AiProviderError(
        `${provider} returned an unexpected embedding dimension`,
        provider,
        "unknown_provider_error"
      );
    }
    return vectors;
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new AiProviderError(`${provider} embedding timeout`, provider, "timeout");
    }
    if (provider === "mistral" && !(error instanceof AiProviderError)) {
      console.error("[Mistral embedding request failed before HTTP response]", {
        model: config.model,
        error: error instanceof Error ? error.message : String(error)
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const status = getEmbeddingStatus();
  if (!status.available || !status.provider) {
    throw new AiProviderError(status.reason || "Embedding provider unavailable", "none", "provider_not_configured");
  }
  if (!texts.length) return [];
  return postEmbeddingRequest(status.provider, texts);
}
