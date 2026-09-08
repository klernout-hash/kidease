import { applyDocumentLocale, LANGUAGES } from "@/lib/languages";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/types";

export function LanguageSelect({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const { t, locale } = useCopy();
  const setLocale = useAppStore((s) => s.setLocale);

  return (
    <label
      className={cn(
        "inline-flex items-center justify-center overflow-visible",
        compact ? "h-8" : "h-11 min-w-[7.25rem]",
        className,
      )}
    >
      <span className="sr-only">{t("language")}</span>
      <select
        value={locale}
        onChange={(e) => {
          const next = e.target.value as Locale;
          setLocale(next);
          applyDocumentLocale(next);
        }}
        className={cn(
          "ke-lang-select w-full cursor-pointer rounded-full border-0 bg-transparent text-center font-medium text-muted hover:text-fg",
          compact
            ? "ke-header-chrome h-8 min-h-8 px-2.5 text-[11px] leading-none"
            : "h-11 min-h-11 px-3.5 text-[15px]",
        )}
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
