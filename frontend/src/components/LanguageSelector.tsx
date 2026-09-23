"use client";

import { useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { LANGUAGES, languageCode, languageTier } from "@/lib/languages";
import { useI18n } from "@/i18n";

export function LanguageSelector() {
  const { language, setLanguage, t } = useI18n();
  const userChanged = useRef(false);
  const saveQueue = useRef(Promise.resolve());

  useEffect(() => {
    api.get("/profile/language-preference").then(({ data }) => {
      const preference = data?.preference?.name;
      if (!userChanged.current && typeof preference === "string" && LANGUAGES.some((item) => item[0] === preference)) setLanguage(preference);
    }).catch(() => undefined);
  }, [setLanguage]);

  async function change(next: string) {
    userChanged.current = true;
    setLanguage(next);
    saveQueue.current = saveQueue.current
      .catch(() => undefined)
      .then(async () => { await api.patch("/profile/language-preference", { languageCode: languageCode(next) }); });
    await saveQueue.current.catch(() => undefined);
  }

  return (
    <label className="flex items-center gap-2 text-xs text-zinc-400" title={languageTier(language) === 2 ? t("common.beta") : undefined}>
      <span>{t("common.language")}</span>
      <select value={language} onChange={(event) => change(event.target.value)} className="max-w-32 rounded border border-white/15 bg-black/20 px-2 py-1 text-xs text-white">
        {LANGUAGES.map(([name, code, tier]) => <option key={code} value={name}>{name}{tier === 2 ? " · Beta" : ""}</option>)}
      </select>
    </label>
  );
}
