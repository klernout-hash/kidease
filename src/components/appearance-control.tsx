import { useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { cn } from "@/lib/utils";
import { THEME_PREFERENCES, type ThemePreference } from "@/lib/theme";
import type { CopyKey } from "@/lib/copy";

const THEME_LABEL: Record<ThemePreference, CopyKey> = {
  light: "appearanceLight",
  dark: "appearanceDark",
  system: "appearanceSystem",
};

export function AppearanceControl({
  variant = "segmented",
  className = "",
}: {
  variant?: "segmented" | "select";
  className?: string;
}) {
  const { t } = useCopy();
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const groupRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = groupRef.current;
    if (!root || !root.contains(document.activeElement)) return;
    root.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus();
  }, [theme]);

  if (variant === "select") {
    return (
      <label className={cn("inline-flex h-11 min-w-[7.25rem] items-center justify-center overflow-visible", className)}>
        <span className="sr-only">{t("appearance")}</span>
        <select
          value={theme}
          onChange={(e) => setTheme(e.target.value as ThemePreference)}
          className="ke-lang-select h-11 min-h-11 w-full cursor-pointer rounded-full border-0 bg-transparent px-3.5 text-center text-[15px] font-medium text-muted hover:text-fg"
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
    </fieldset>
  );
}
