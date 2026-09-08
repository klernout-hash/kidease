import { useEffect, useLayoutEffect } from "react";
import { paintStatusBar } from "@/lib/native";
import { useAppStore } from "@/lib/store";
import { applyTheme, readThemePreference, subscribeSystemTheme } from "@/lib/theme";

/** Hydrate the stored Appearance preference and keep System in sync with the OS. */
export function ThemeBoot() {
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);

  useLayoutEffect(() => {
    const pref = readThemePreference();
    const resolved = applyTheme(pref);
    useAppStore.setState({ theme: pref, resolvedTheme: resolved });
    return subscribeSystemTheme(() => {
      const current = useAppStore.getState().theme;
      if (current !== "system") return;
      const next = applyTheme(current);
      useAppStore.setState({ resolvedTheme: next });
    });
  }, []);

  useEffect(() => {
    void paintStatusBar(resolvedTheme);
  }, [resolvedTheme]);

  return null;
}
