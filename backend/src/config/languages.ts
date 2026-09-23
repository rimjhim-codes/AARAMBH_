export const SUPPORTED_LANGUAGES = [
  { name: "English", code: "en", tier: 1 },
  { name: "Hindi", code: "hi", tier: 1 },
  { name: "Bengali", code: "bn", tier: 1 },
  { name: "Tamil", code: "ta", tier: 1 },
  { name: "Telugu", code: "te", tier: 1 },
  { name: "Marathi", code: "mr", tier: 1 },
  { name: "Gujarati", code: "gu", tier: 1 },
  { name: "Kannada", code: "kn", tier: 1 },
  { name: "Malayalam", code: "ml", tier: 1 },
  { name: "Punjabi", code: "pa", tier: 1 },
  { name: "Urdu", code: "ur", tier: 1 },
  { name: "Assamese", code: "as", tier: 2 },
  { name: "Bodo", code: "brx", tier: 2 },
  { name: "Dogri", code: "doi", tier: 2 },
  { name: "Kashmiri", code: "ks", tier: 2 },
  { name: "Konkani", code: "kok", tier: 2 },
  { name: "Maithili", code: "mai", tier: 2 },
  { name: "Manipuri", code: "mni", tier: 2 },
  { name: "Nepali", code: "ne", tier: 2 },
  { name: "Odia", code: "or", tier: 2 },
  { name: "Sanskrit", code: "sa", tier: 2 },
  { name: "Santali", code: "sat", tier: 2 },
  { name: "Sindhi", code: "sd", tier: 2 }
] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]["name"];
export const LANGUAGE_NAMES = SUPPORTED_LANGUAGES.map((language) => language.name) as [SupportedLanguage, ...SupportedLanguage[]];
export function languageTier(language?: string) {
  return SUPPORTED_LANGUAGES.find((item) => item.name === language)?.tier || 1;
}

/** Canonical Phase 6 contract; the legacy catalogue remains for compatibility. */
export const LANGUAGE_REGISTRY = [
  { code: "en", name: "English", nativeName: "English", locale: "en-IN", direction: "ltr", status: "supported", enabled: true, productionSupported: true, fallbackLanguage: "en" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", locale: "hi-IN", direction: "ltr", status: "supported", enabled: true, productionSupported: true, fallbackLanguage: "en" },
  ...SUPPORTED_LANGUAGES.filter(({ code }) => !["en", "hi"].includes(code)).map((language) => ({
    code: language.code, name: language.name, nativeName: language.name, locale: `${language.code}-IN`, direction: "ltr" as const,
    status: "planned" as const, enabled: false, productionSupported: false, fallbackLanguage: "en"
  }))
] as const;
export type LanguageCode = (typeof LANGUAGE_REGISTRY)[number]["code"];
export type LanguageMetadata = (typeof LANGUAGE_REGISTRY)[number];
export const DEFAULT_LANGUAGE_CODE: LanguageCode = "en";
export const SELECTABLE_LANGUAGE_CODES = LANGUAGE_REGISTRY.filter((language) => language.enabled && language.productionSupported).map((language) => language.code) as LanguageCode[];
export function languageByCode(code?: string) { return LANGUAGE_REGISTRY.find((language) => language.code === code); }
export function languageByName(name?: string) { return LANGUAGE_REGISTRY.find((language) => language.name === name); }
export function isSelectableLanguage(value?: string): value is LanguageCode { const language = languageByCode(value) || languageByName(value); return Boolean(language?.enabled && language.productionSupported); }
/** Accepts both new codes and legacy display-name records. */
export function normalizeLanguageCode(value?: string): LanguageCode { const language = languageByCode(value) || languageByName(value); return language?.enabled && language.productionSupported ? language.code : DEFAULT_LANGUAGE_CODE; }
export function languageName(value?: string) { return languageByCode(value)?.name || languageByName(value)?.name || "English"; }
export function resolveLanguagePreference(value?: string): LanguageMetadata { return languageByCode(normalizeLanguageCode(value)) || LANGUAGE_REGISTRY[0]; }
export type LanguageContext = { learnerLanguage: LanguageCode; requestedLanguage: LanguageCode; sourceLanguage: LanguageCode; fallbackLanguage: LanguageCode; locale: string };
export function createLanguageContext(preferredLanguage?: string, requestedLanguage?: string, sourceLanguage = "en"): LanguageContext {
  const learner = normalizeLanguageCode(preferredLanguage); const requested = normalizeLanguageCode(requestedLanguage || learner); const source = languageByCode(sourceLanguage)?.code || DEFAULT_LANGUAGE_CODE; const metadata = resolveLanguagePreference(requested);
  return { learnerLanguage: learner, requestedLanguage: requested, sourceLanguage: source, fallbackLanguage: normalizeLanguageCode(metadata.fallbackLanguage), locale: metadata.locale };
}
