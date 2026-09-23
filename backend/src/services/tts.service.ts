import crypto from "crypto";
import { env } from "../config/env";
import { TtsCacheModel } from "../models/sih/TtsCache";

export function prepareTeacherStyleText(text: string): string {
  if (!text) return "";
  let formatted = text.replace(/\n+/g, ". ");
  formatted = formatted.replace(/\*/g, ""); 
  return formatted.trim();
}

// Map ARAMBH language codes to Sarvam target_language_code and speakers
const SARVAM_LANGUAGE_MAP: Record<string, { code: string; speaker: string; fallback: string }> = {
  en: { code: "en-IN", speaker: "ritu", fallback: "en" },
  hi: { code: "hi-IN", speaker: "ritu", fallback: "hi" },
  bn: { code: "bn-IN", speaker: "roopa", fallback: "en" },
  ta: { code: "ta-IN", speaker: "vijay", fallback: "en" },
  te: { code: "te-IN", speaker: "kavitha", fallback: "en" },
  mr: { code: "mr-IN", speaker: "ritu", fallback: "hi" },
  gu: { code: "gu-IN", speaker: "pooja", fallback: "hi" },
  kn: { code: "kn-IN", speaker: "shruti", fallback: "en" },
  pa: { code: "pa-IN", speaker: "ritu", fallback: "hi" },
  ml: { code: "ml-IN", speaker: "ritu", fallback: "en" },
  or: { code: "od-IN", speaker: "ritu", fallback: "en" }, // Odia uses od-IN
  // as and ur are in beta/unsupported for this tier, relying on safe fallback
  as: { code: "en-IN", speaker: "ritu", fallback: "en" }, 
  ur: { code: "hi-IN", speaker: "ritu", fallback: "hi" }  
};

export async function generateTeacherAudio(text: string, aarambhLanguageCode: string): Promise<string> {
  const processedText = prepareTeacherStyleText(text);
  if (!processedText) return "";
  
  // Resolve mapping or use fallback
  let mapping = SARVAM_LANGUAGE_MAP[aarambhLanguageCode];
  if (!mapping) {
    // Unsupported language -> degrade to English (or the configured fallback)
    mapping = SARVAM_LANGUAGE_MAP["en"];
  }
  
  const targetLanguageCode = mapping.code;
  const speaker = mapping.speaker;
  
  // Strict Cache Key hashing to prevent cross-language/voice bleed
  const cacheKey = crypto.createHash("sha256")
    .update(`${processedText}:${targetLanguageCode}:${speaker}:sarvam_bulbul_v3`)
    .digest("hex");
  
  const cached = await TtsCacheModel.findOne({ cacheKey }).lean();
  if (cached && cached.audioBase64) {
    return cached.audioBase64;
  }
  
  if (!env.sarvamApiKey) {
    throw new Error("TTS is unavailable because SARVAM_API_KEY is not configured.");
  }

  const response = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-subscription-key": env.sarvamApiKey
    },
    body: JSON.stringify({
      inputs: [processedText.slice(0, 500)], 
      target_language_code: targetLanguageCode, 
      speaker: speaker,
      pitch: 0,
      pace: 1.0,
      loudness: 1.5,
      speech_sample_rate: 16000,
      enable_preprocessing: true,
      model: "bulbul:v3" 
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Sarvam TTS API failed: ${response.status} - ${errorText}`);
  }

  const data = (await response.json()) as { audios?: string[] };
  const audioBase64 = data?.audios?.[0]; 
  
  if (!audioBase64) {
    throw new Error("Sarvam TTS API returned invalid audio payload.");
  }
  
  await TtsCacheModel.findOneAndUpdate(
    { cacheKey },
    { audioBase64, provider: "sarvam" },
    { upsert: true, new: true }
  );
  
  return audioBase64;
}
