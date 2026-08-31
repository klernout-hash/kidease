import { applyDocumentLocale, LANGUAGES } from "@/lib/languages";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/types";

export function LanguageSelect({ className = "" }: { className?: string }) {
  const { t, locale } = useCopy();
  const setLocale = useAppStore((s) => s.setLocale);

  return (
    <label className={cn("inline-flex h-9 items-center justify-center", className)}>
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        onChange={(e) => {
          const next = e.target.value as Locale;
          setLocale(next);
          applyDocumentLocale(next);
        }}
        className="h-9 cursor-pointer appearance-none rounded-full border-0 bg-transparent px-3 text-center text-xs leading-9 text-muted hover:text-fg [text-align-last:center]"
        aria-label={t("language")}
      >
        {LANGUAGES.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.native}
          </option>
        ))}
      </select>
    </label>
  );
}
