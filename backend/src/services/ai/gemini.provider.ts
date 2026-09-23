import { env } from "../../config/env";
import {
  AiGenerateInput,
  AiProvider,
  AiProviderError,
  classifyProviderError
} from "./types";

export class GeminiProvider implements AiProvider {
  name = "gemini";

  isConfigured() {
    return Boolean(env.geminiApiKey);
  }

  async generateText(input: AiGenerateInput): Promise<string> {
    if (!this.isConfigured()) {
      throw new AiProviderError("GEMINI_API_KEY not configured", this.name, "provider_not_configured");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.aiRequestTimeoutMs);

    console.log("[GeminiProvider] request started", {
      promptLength: input.prompt.length,
      temperature: input.temperature,
      maxTokens: input.maxTokens
    });

    try {
      const body = {
        contents: [{ parts: [{ text: input.prompt }] }],
        generationConfig: {
          temperature: input.temperature ?? 0.35,
          maxOutputTokens: input.maxTokens ?? 8192
        }
      };

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/gemini-3.6-flash:generateContent?key=${env.geminiApiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal
        }
      );

      if (!res.ok) {
        const text = await res.text();
        console.error("[GeminiProvider] Gemini API error:", {
          status: res.status,
          statusText: res.statusText,
          body: text
        });
        throw classifyProviderError(this.name, res.status, text);
      }

      const data = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      return (
        data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || ""
      ).trim();
    } catch (e) {
      if ((e as Error)?.name === "AbortError") {
        throw new AiProviderError("Gemini timeout", this.name, "timeout");
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
