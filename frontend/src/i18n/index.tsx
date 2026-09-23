"use client";

import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { languageCode, languageTier } from "@/lib/languages";

type MessageTree = Record<string, any>;
const dictionaries: Record<string, MessageTree> = {
  en: require("./messages/en.json"), hi: require("./messages/hi.json"), bn: require("./messages/bn.json"),
  ta: require("./messages/ta.json"), te: require("./messages/te.json"), mr: require("./messages/mr.json"),
  gu: require("./messages/gu.json"), kn: require("./messages/kn.json"), ml: require("./messages/ml.json"),
  pa: require("./messages/pa.json"), ur: require("./messages/ur.json")
};

type I18nContextValue = { language: string; setLanguage: (language: string) => void; tier: number; t: (key: string) => string };
const I18nContext = createContext<I18nContextValue | null>(null);

function lookup(tree: MessageTree, key: string) {
  return key.split(".").reduce<any>((value, part) => value?.[part], tree);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState("English");
  const value = useMemo(() => ({
    language,
    setLanguage,
    tier: languageTier(language),
    t: (key: string) => String(lookup(dictionaries[languageCode(language)] || dictionaries.en, key) ?? lookup(dictionaries.en, key) ?? key)
  }), [language]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used within I18nProvider");
  return value;
}
