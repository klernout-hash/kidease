import { useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";
import { TEXT_SCALES, type TextScale } from "@/lib/text-scale";
import type { CopyKey } from "@/lib/copy";

const THEME_LABEL: Record<ThemePreference, CopyKey> = {
  light: "appearanceLight",
  dark: "appearanceDark",
  system: "appearanceSystem",
};

const TEXT_LABEL: Record<TextScale, CopyKey> = {
  md: "textSizeMd",
  lg: "textSizeLg",
  xl: "textSizeXl",
};

export function AppearanceControl({
  variant = "segmented",
  className = "",
  compact = false,
}: {
  variant?: "segmented" | "select";
  className?: string;
  compact?: boolean;
}) {
  const { t } = useCopy();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const textScale = useAppStore((s) => s.textScale);
  const setTextScale = useAppStore((s) => s.setTextScale);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = groupRef.current;
    if (!root || !root.contains(document.activeElement)) return;
    root.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
  }, [theme]);

  if (variant === "select") {
    return (
      <label
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-visible",
          compact ? "h-8 min-w-[5.5rem]" : "h-11 min-w-[7.25rem]",
          className,
        )}
      >
        <span className="sr-only">{t("appearance")}</span>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as ThemePreference)}
          className={cn(
            "ke-lang-select w-full cursor-pointer rounded-full border-0 bg-transparent text-center font-medium text-muted hover:text-fg",
            compact
              ? "ke-header-chrome h-8 min-h-8 min-w-[5.5rem] px-2.5 text-[11px] leading-none"
              : "h-11 min-h-11 px-3.5 text-[15px]",
          )}
          aria-label={t("appearance")}
        >
          {THEME_PREFERENCES.map((pref) => (
            <option key={pref} value={pref}>
              {t(THEME_LABEL[pref])}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className="text-sm font-medium text-fg">{t("appearance")}</legend>
      <p className="mt-1 text-[13px] text-muted">{t("appearanceHint")}</p>
      <div
        ref={groupRef}
        role="radiogroup"
        aria-label={t("appearance")}
        className="mt-3 flex h-11 overflow-hidden rounded-full bg-bg ring-1 ring-border"
      >
        {THEME_PREFERENCES.map((pref, index) => {
          const on = theme === pref;
          return (
            <button
              key={pref}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => setTheme(pref)}
              onKeyDown={(e) => {
                const next =
                  e.key === "ArrowRight" || e.key === "ArrowDown"
                    ? THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length]
                    : e.key === "ArrowLeft" || e.key === "ArrowUp"
                      ? THEME_PREFERENCES[(index - 1 + THEME_PREFERENCES.length) % THEME_PREFERENCES.length]
                      : e.key === "Home"
                        ? THEME_PREFERENCES[0]
                        : e.key === "End"
                          ? THEME_PREFERENCES[THEME_PREFERENCES.length - 1]
                          : null;
                if (!next) return;
                e.preventDefault();
                setTheme(next);
              }}
              className={cn(
                "flex-1 px-2 text-sm font-semibold",
                on ? "bg-fg text-bg" : "text-muted hover:text-fg",
              )}
            >
              {t(THEME_LABEL[pref])}
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-sm font-medium text-fg" id="text-size-label">
        {t("textSize")}
      </p>
      <p className="mt-1 text-[13px] text-muted">{t("textSizeHint")}</p>
      <div role="radiogroup" aria-labelledby="text-size-label" className="mt-3 flex h-11 overflow-hidden rounded-full bg-bg ring-1 ring-border">
        {TEXT_SCALES.map((scale) => {
          const on = textScale === scale;
          return (
            <button
              key={scale}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setTextScale(scale)}
              className={cn("min-h-11 flex-1 px-2 text-sm font-semibold", on ? "bg-fg text-bg" : "text-muted hover:text-fg")}
            >
              {t(TEXT_LABEL[scale])}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
