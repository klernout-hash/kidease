import { useEffect, useLayoutEffect } from "react";
import { paintStatusBar } from "@/lib/native";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMyTheme, saveMyTheme } from "@/lib/server/account-prefs";
import { useAppStore } from "@/lib/store";
import { applyTheme, readThemePreference, setThemePersister, subscribeSystemTheme } from "@/lib/theme";

/** Hydrate the stored Appearance preference and keep System in sync with the OS. */
export function ThemeBoot() {
  const resolvedTheme = useAppStore((s) => s.resolvedTheme);
  const { user, isPending } = useCurrentUserState();

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

  useEffect(() => {
    if (isPending || !user) {
      setThemePersister(null);
      return;
    }
    let cancel = false;
    void getMyTheme()
      .then((theme) => {
        if (cancel) return;
        useAppStore.getState().setTheme(theme);
        setThemePersister((next) => {
          void saveMyTheme({ data: { theme: next } }).catch(() => undefined);
        });
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
      setThemePersister(null);
    };
  }, [isPending, user]);

  return null;
}
