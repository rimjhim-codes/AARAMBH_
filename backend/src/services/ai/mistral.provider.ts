import { env } from "../../config/env";
import {
  AiGenerateInput,
  AiProvider,
  AiProviderError,
  classifyProviderError
} from "./types";

export class MistralProvider implements AiProvider {
  name = "mistral";

  isConfigured() {
    return Boolean(env.mistralApiKey);
  }

  async generateText(input: AiGenerateInput): Promise<string> {
    if (!this.isConfigured()) {
      throw new AiProviderError("MISTRAL_API_KEY not configured", this.name, "provider_not_configured");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.aiRequestTimeoutMs);

    try {
      const res = await fetch("https://api.mistral.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.mistralApiKey}`
        },
        body: JSON.stringify({
          model: process.env.MISTRAL_CHAT_MODEL || "mistral-small-latest",
          temperature: input.temperature ?? 0.35,
          max_tokens: input.maxTokens ?? 4096,
          messages: [
            ...(input.system ? [{ role: "system", content: input.system }] : []),
            { role: "user", content: input.prompt }
          ]
        }),
        signal: controller.signal
      });

      if (!res.ok) {
        const text = await res.text();
        throw classifyProviderError(this.name, res.status, text);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      return String(data?.choices?.[0]?.message?.content || "").trim();
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        throw new AiProviderError("Mistral timeout", this.name, "timeout");
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
