import type { Locale } from "./types";

/** Top 10 languages in Canada (Statistics Canada, 2021 — mother tongue). */
export const LANGUAGES: readonly {
  code: Locale;
  native: string;
  nameEn: string;
  bcp47: string;
  rtl?: boolean;
}[] = [
  { code: "en", native: "English", nameEn: "English", bcp47: "en-CA" },
  { code: "fr", native: "Français", nameEn: "French", bcp47: "fr-CA" },
  { code: "zh", native: "中文（普通话）", nameEn: "Mandarin", bcp47: "zh-Hans-CA" },
  { code: "yue", native: "廣東話", nameEn: "Cantonese", bcp47: "zh-HK" },
  { code: "pa", native: "ਪੰਜਾਬੀ", nameEn: "Punjabi", bcp47: "pa-Guru-CA" },
  { code: "es", native: "Español", nameEn: "Spanish", bcp47: "es-CA" },
  { code: "ar", native: "العربية", nameEn: "Arabic", bcp47: "ar", rtl: true },
  { code: "tl", native: "Tagalog", nameEn: "Tagalog", bcp47: "fil-CA" },
  { code: "it", native: "Italiano", nameEn: "Italian", bcp47: "it-CA" },
  { code: "de", native: "Deutsch", nameEn: "German", bcp47: "de-CA" },
];

export function languageMeta(code: Locale) {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

export function localeTag(code: Locale) {
  return languageMeta(code).bcp47;
}

export function isRtl(code: Locale) {
  return Boolean(languageMeta(code).rtl);
}

export function applyDocumentLocale(code: Locale) {
  if (typeof document === "undefined") return;
  const meta = languageMeta(code);
  document.documentElement.lang = meta.bcp47;
  document.documentElement.dir = meta.rtl ? "rtl" : "ltr";
}
