import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Locale, Translations } from "./types";
import { de } from "./locales/de";
import { en } from "./locales/en";
import { zh } from "./locales/zh";

const STORAGE_KEY = "myremote:locale";
const DEFAULT_LOCALE: Locale = "de";

const dictionaries: Record<Locale, Translations> = { de, en, zh };

export const locales: Locale[] = ["de", "en", "zh"];

function isLocale(value: string | null): value is Locale {
  return value === "de" || value === "en" || value === "zh";
}

function detectInitialLocale(): Locale {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (isLocale(stored)) return stored;
  return DEFAULT_LOCALE;
}

interface LanguageContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
  }, []);

  const value = useMemo<LanguageContextValue>(
    () => ({ locale, setLocale, t: dictionaries[locale] }),
    [locale, setLocale],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

/** Liefert die aktuelle Sprache, den Setter und das Übersetzungsobjekt der aktuell aktiven Sprache. */
export function useLanguage(): LanguageContextValue {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage muss innerhalb eines LanguageProvider verwendet werden");
  return ctx;
}

/** Bequemer Zugriff nur auf die Übersetzungstexte, wenn die Sprache selbst nicht benötigt wird. */
export function useTranslation(): Translations {
  return useLanguage().t;
}

export type { Locale, Translations };
