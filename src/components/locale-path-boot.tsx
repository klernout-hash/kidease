import { useLayoutEffect } from "react";
import { applyDocumentLocale } from "@/lib/languages";
import { useAppStore } from "@/lib/store";
import type { Locale } from "@/lib/types";

/** Pin the Zustand locale when a `/fr` document URL is the source of truth. */
export function LocalePathBoot({ locale }: { locale: Locale }) {
  const setLocale = useAppStore((s) => s.setLocale);

  useLayoutEffect(() => {
    setLocale(locale);
    applyDocumentLocale(locale);
  }, [locale, setLocale]);

  return null;
}
