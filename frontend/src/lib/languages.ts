export const LANGUAGES: ReadonlyArray<readonly [string, string, number]> = [
  ["English", "en", 1], ["Hindi", "hi", 1]
] as const;

export type LanguageName = (typeof LANGUAGES)[number][0];
export const TIER_1_LANGUAGES = LANGUAGES.filter((language) => language[2] === 1).map((language) => language[0]);
export function languageCode(language: string) {
  return LANGUAGES.find((item) => item[0] === language)?.[1] || "en";
}
export function languageTier(language: string) {
  return LANGUAGES.find((item) => item[0] === language)?.[2] || 1;
}
