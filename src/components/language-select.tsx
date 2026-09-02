import { applyDocumentLocale, LANGUAGES } from "@/lib/languages";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/types";

export function LanguageSelect({ className = "" }: { className?: string }) {
  const { t, locale } = useCopy();
  const setLocale = useAppStore((s) => s.setLocale);

  return (
    <label className={cn("inline-flex h-11 min-w-[7.25rem] items-center justify-center overflow-visible", className)}>
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        onChange={(e) => {
          const next = e.target.value as Locale;
          setLocale(next);
          applyDocumentLocale(next);
        }}
        className="ke-lang-select h-11 min-h-11 w-full cursor-pointer rounded-full border-0 bg-transparent px-3.5 text-center text-[15px] font-medium text-muted hover:text-fg"
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
