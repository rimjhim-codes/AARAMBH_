import { EmployeeProfileModel } from "../models/sih/SihModels";
import { DEFAULT_LANGUAGE_CODE, LANGUAGE_REGISTRY, LanguageCode, createLanguageContext, isSelectableLanguage, normalizeLanguageCode, resolveLanguagePreference } from "../config/languages";

export class UnsupportedLanguageError extends Error { statusCode = 400; constructor() { super("Only currently supported languages can be selected."); } }
export function selectableLanguageMetadata() { return LANGUAGE_REGISTRY.filter((language) => language.enabled && language.productionSupported); }
export async function getLearnerLanguagePreference(userId: string) {
  const profile = await EmployeeProfileModel.findOne({ userId }).select("languagePreference").lean(); const preference = resolveLanguagePreference(profile?.languagePreference);
  return { preference, defaultLanguage: DEFAULT_LANGUAGE_CODE, fallbackLanguage: DEFAULT_LANGUAGE_CODE, availableLanguages: selectableLanguageMetadata(), languageContext: createLanguageContext(preference.code) };
}
export async function updateLearnerLanguagePreference(userId: string, value: string) {
  if (!isSelectableLanguage(value)) throw new UnsupportedLanguageError(); const languageCode = normalizeLanguageCode(value) as LanguageCode;
  const profile = await EmployeeProfileModel.findOneAndUpdate({ userId }, { $set: { userId, languagePreference: languageCode } }, { upsert: true, new: true }).select("languagePreference").lean(); const preference = resolveLanguagePreference(profile?.languagePreference || languageCode);
  return { preference, defaultLanguage: DEFAULT_LANGUAGE_CODE, fallbackLanguage: DEFAULT_LANGUAGE_CODE, availableLanguages: selectableLanguageMetadata(), languageContext: createLanguageContext(preference.code) };
}
