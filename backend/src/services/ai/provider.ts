import { AIUsageModel } from "../../models/sih/SihModels";
import { env } from "../../config/env";
import { GeminiProvider } from "./gemini.provider";
import { MistralProvider } from "./mistral.provider";
import { OpenAiProvider } from "./openai.provider";
import { AiGenerateInput, AiProvider, AiProviderError, extractJsonBlock } from "./types";

const providers: Record<string, AiProvider> = {
  gemini: new GeminiProvider(),
  openai: new OpenAiProvider(),
  mistral: new MistralProvider()
};

function orderedProviders(): AiProvider[] {
  const names = [env.aiProvider, ...env.aiFallbackProviders];
  const seen = new Set<string>();
  const list: AiProvider[] = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    const p = providers[name];
    if (p) list.push(p);
  }
  return list;
}

export async function generateWithFallback(
  input: AiGenerateInput,
  userId?: string
): Promise<{ text: string; provider: string }> {
  const chain = orderedProviders().filter((p) => p.isConfigured());
  if (!chain.length) {
    throw new AiProviderError(
      "No AI provider configured. Set GEMINI_API_KEY, MISTRAL_API_KEY, or OPENAI_API_KEY.",
      "none",
      "provider_not_configured"
    );
  }

  const errors: string[] = [];
  for (const provider of chain) {
    const started = Date.now();
    try {
      const text = await provider.generateText(input);
      await AIUsageModel.create({
        provider: provider.name,
        task: input.task || "text",
        success: true,
        latencyMs: Date.now() - started,
        userId
      }).catch(() => undefined);
      return { text, provider: provider.name };
    } catch (e) {
      const err = e as AiProviderError;
      const code = err.code || "unknown_provider_error";
      errors.push(`${provider.name}:${code}`);
      await AIUsageModel.create({
        provider: provider.name,
        task: input.task || "text",
        success: false,
        latencyMs: Date.now() - started,
        errorCode: String(code),
        userId
      }).catch(() => undefined);

      // Do not fallback on not_configured for this provider — try next
      continue;
    }
  }

  throw new AiProviderError(
    `All configured AI providers failed. No fabricated output was generated.`,
    "all",
    "provider_unavailable",
    errors.map((item) => {
      const [provider, status] = item.split(":");
      return { provider, status };
    })
  );
}

export async function generateJsonWithFallback<T>(
  input: AiGenerateInput,
  parse: (raw: unknown) => T,
  userId?: string
): Promise<{ data: T; provider: string }> {
  const { text, provider } = await generateWithFallback(
    { ...input, task: input.task || "json", temperature: input.temperature ?? 0.2 },
    userId
  );
  const block = extractJsonBlock(text);
  let parsed: unknown;
  try {
    parsed = JSON.parse(block);
  } catch {
    throw new AiProviderError("AI returned invalid JSON", provider, "unknown_provider_error");
  }
  return { data: parse(parsed), provider };
}

export function getAiProviderStatus() {
  return orderedProviders().map((p) => ({
    name: p.name,
    configured: p.isConfigured(),
    primary: p.name === env.aiProvider
  }));
}
