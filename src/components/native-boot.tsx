import { useEffect, useLayoutEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { microsoftStoreCookieHeader } from "@/lib/native-entitlements";
import {
  captureInstallPrompt,
  getDeviceLocation,
  hideNativeSplash,
  isNative,
  isStandalone,
  paintStatusBar,
  registerOfflineShell,
} from "@/lib/native";
import { locateHere } from "@/lib/proximity";
import { startChannelListener } from "@/lib/runtime";
import { startWebVitals } from "@/lib/web-vitals";
import {
  resolveDefaultSearchOrigin,
  readClientTimeZone,
  trustedSavedOrigin,
} from "@/lib/default-origin";
import { clearSavedOrigin, readSavedOrigin, reverseGeocode } from "@/lib/geo";
import { gpsMayMoveSearchOrigin, searchQueryFromUnknown, urlHasGeocodableSearchQuery } from "@/lib/search-query";
import { readDualAnchorPrefs } from "@/lib/dual-anchor";
import { activateLocale, isExtraLocale } from "@/lib/extra-copy";
import { localeFromPreference } from "@/lib/languages";
import { localeFromSearch, readLocaleCookie, writeLocaleChoiceCookie } from "@/lib/locale-geo";
import { isFrPath } from "@/lib/locale-path";
import { useAppStore } from "@/lib/store";
import { readDistanceUnit } from "@/lib/units";
import { readLocationConsent } from "@/lib/location-consent";
import { bindAndroidBack } from "@/lib/android-back";
import { currentAuthPageBack, isAuthPagePath } from "@/lib/auth/auth-back";
import { safeInternalPath } from "@/lib/safe-internal-path";
import { usePushRegistration } from "@/lib/use-push";
import { useHuaweiCallPushRegistration } from "@/lib/use-huawei-call-push";
import { applyTheme, readThemePreference } from "@/lib/theme";

/**
 * Web boot must never paint a full-screen BrandMark. Without CSS an in-flow
 * mark can still cover the home page. Capacitor already has its own splash —
 * we only hide it here.
 */
export function NativeBoot() {
  usePushRegistration();
  useHuaweiCallPushRegistration();
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const appleShortcuts = useRouterState({
    select: (s) => s.matches.some((match) => (match.context as { appleShortcuts?: boolean }).appleShortcuts === true),
  });
  const appleWidget = useRouterState({
    select: (s) => s.matches.some((match) => (match.context as { appleHomeWidget?: boolean }).appleHomeWidget === true),
  });
  const playUpdates = useRouterState({
    select: (s) => s.matches.some((match) => (match.context as { playUpdates?: boolean }).playUpdates === true),
  });
  const playShortcuts = useRouterState({
    select: (s) => s.matches.some((match) => (match.context as { playShortcuts?: boolean }).playShortcuts === true),
  });
  const playIntegrity = useRouterState({
    select: (s) => s.matches.some((match) => (match.context as { playIntegrity?: boolean }).playIntegrity === true),
  });
  const msBadging = useRouterState({
    select: (s) => s.matches.some((match) => (match.context as { msBadging?: boolean }).msBadging === true),
  });
  const huaweiAppLinking = useRouterState({
    select: (s) => s.matches.some((match) => (match.context as { huaweiAppLinking?: boolean }).huaweiAppLinking === true),
  });
  const huaweiAlertPush = useRouterState({
    select: (s) => s.matches.some((match) => (match.context as { huaweiAlertPush?: boolean }).huaweiAlertPush === true),
  });
  const setOrigin = useAppStore((s) => s.setOrigin);
  const setWorkOrigin = useAppStore((s) => s.setWorkOrigin);
  const setAnchorMode = useAppStore((s) => s.setAnchorMode);
  const setLocated = useAppStore((s) => s.setLocated);
  const setLocale = useAppStore((s) => s.setLocale);
  const setLiveOnly = useAppStore((s) => s.setLiveOnly);
  const setDistanceUnit = useAppStore((s) => s.setDistanceUnit);
  const setLocationConsent = useAppStore((s) => s.setLocationConsent);

  useLayoutEffect(() => {
    try {
      const query = localeFromSearch(window.location.search);
      if (query === "en" || query === "fr") {
        setLocale(query);
        return;
      }
      const cookie = readLocaleCookie(document.cookie);
      const raw = window.localStorage.getItem("kidease-locale");
      // The old boot wrote "en" for everyone. Only a non-English stored value is a real choice.
      const legacy = raw && raw !== "en" ? raw : null;
      const saved = localeFromPreference(cookie || legacy);
      if (cookie || legacy) {
        if (!cookie && legacy) writeLocaleChoiceCookie(saved);
        if (!isExtraLocale(saved)) {
          setLocale(saved, { lock: true });
        } else {
          void activateLocale(saved).then((ok) => {
            if (ok) setLocale(saved, { lock: true });
          });
        }
        return;
      }
      if (isFrPath(window.location.pathname)) setLocale("fr");
    } catch {
      /* ignore */
    }
  }, [setLocale, searchStr]);

  useEffect(() => {
    try {
      window.localStorage.removeItem("kidease-live-only");
      setLiveOnly(false);
      setDistanceUnit(readDistanceUnit());
      setLocationConsent(readLocationConsent());
      const dual = readDualAnchorPrefs();
      setWorkOrigin(dual.work);
      setAnchorMode(dual.mode);
      const theme = readThemePreference();
      useAppStore.setState({ theme, resolvedTheme: applyTheme(theme) });
    } catch {
      /* ignore */
    }
  }, [setLiveOnly, setDistanceUnit, setLocationConsent, setWorkOrigin, setAnchorMode]);

  useLayoutEffect(() => {
    // Hide after the shell has painted so the splash does not drop onto a blank WebView.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        void hideNativeSplash();
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, []);

  useEffect(() => {
    const header = microsoftStoreCookieHeader(
      {
        userAgent: window.navigator.userAgent,
        search: searchStr || window.location.search,
      },
      { secure: window.location.protocol === "https:" },
    );
    if (header) document.cookie = header;
  }, [searchStr]);

  useEffect(() => {
    captureInstallPrompt();
    registerOfflineShell();
    void paintStatusBar();
    void hideNativeSplash();
    const persistentMark = /(?:^|; )kidease-persistent=1(?:;|$)/.test(document.cookie);
    let pendingEnroll = false;
    try {
      pendingEnroll = sessionStorage.getItem("ke-persistent-enroll") != null;
    } catch {
      pendingEnroll = false;
    }
    if (isNative() || isStandalone() || persistentMark || pendingEnroll) {
      void import("@/lib/persistent-session-client").then((mod) => mod.bootPersistentSession());
    }
    if (!isNative()) return;
    let stop = () => {};
    void import("@/lib/auth/native-oauth-client").then((mod) => {
      void mod.bindNativeOAuthReturn().then((unbind) => {
        stop = unbind;
      });
    });
    return () => stop();
  }, []);

  useEffect(() => {
    let remove = () => {};
    let cancelled = false;
    void bindAndroidBack(
      (canGoBack) => {
        // N-78: on sign-in/sign-up, Back only pops history to a public page this tab saw.
        // Cold opens, and entries that are the protected tab that sent the guest here,
        // go to a public page instead, never back into the sign-in bounce.
        if (isAuthPagePath(window.location.pathname)) {
          const next = new URLSearchParams(window.location.search).get("next");
          const plan = currentAuthPageBack(canGoBack, next, window.location.pathname.startsWith("/fr/") ? "fr" : "en");
          if (plan.via === "replace") {
            window.location.replace(safeInternalPath(plan.href, "/"));
            return;
          }
        }
        window.history.back();
      },
      () => {
        void import("@capacitor/app").then(({ App }) => App.exitApp());
      },
    ).then((stop) => {
      if (cancelled) stop();
      else remove = stop;
    });
    return () => {
      cancelled = true;
      remove();
    };
  }, []);

  useEffect(() => {
    const idle = window.setTimeout(() => startWebVitals(), 2500);
    return () => window.clearTimeout(idle);
  }, []);

  useEffect(() => {
    if (appleShortcuts !== true && appleWidget !== true) return;
    const locale = document.documentElement.lang.toLowerCase().startsWith("fr") ? "fr" : "en";
    void import("@/lib/apple/platform-client").then((mod) => {
      if (appleShortcuts === true) void mod.applyAppleShortcuts(true, locale);
      if (appleWidget === true) void mod.writeAppleHomeWidget(true, locale);
    });
  }, [appleShortcuts, appleWidget]);

  useEffect(() => {
    if (playUpdates !== true && playShortcuts !== true && playIntegrity !== true) return;
    const locale = document.documentElement.lang.toLowerCase().startsWith("fr") ? "fr" : "en";
    void import("@/lib/google/platform-client").then((mod) => {
      if (playUpdates === true) void mod.checkPlayUpdate(true);
      if (playShortcuts === true) void mod.applyPlayShortcuts(true, locale);
      if (playIntegrity === true) void mod.requestPlayIntegrity(true);
    });
  }, [playUpdates, playShortcuts, playIntegrity]);

  useEffect(() => {
    if (msBadging !== true) return;
    void import("@/lib/microsoft/platform-client").then((mod) => mod.applyMicrosoftBadge(true, null, navigator));
  }, [msBadging]);

  useEffect(() => {
    if (!isNative()) return;
    let remove = () => {};
    const openAppLink = (url: string | null | undefined) => {
      void import("@/lib/app-link").then(({ appLinkPath }) => {
        const path = appLinkPath(url);
        if (!path) return;
        const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        if (current === path) return;
        const here = window.location.hostname;
        if (here === "www.kidease.ca" || here === "kidease.ca") window.location.assign(path);
        else window.location.assign(`https://www.kidease.ca${path}`);
      });
    };
    void import("@capacitor/app").then(({ App }) => {
      // EM1: a cold start from a link lands on the home page with no
      // appUrlOpen event. Open the launch link once per app run (sessionStorage
      // lives as long as the WebView), never again on later reloads.
      void App.getLaunchUrl()
        .then((launch) => {
          const url = launch?.url;
          if (!url) return;
          try {
            if (sessionStorage.getItem("ke-launch-url") === url) return;
            sessionStorage.setItem("ke-launch-url", url);
          } catch {
            return;
          }
          openAppLink(url);
        })
        .catch(() => undefined);
      return App.addListener("appUrlOpen", (event) => {
        try {
          sessionStorage.setItem("ke-launch-url", event.url);
        } catch {
          /* ignore */
        }
        openAppLink(event.url);
      }).then((handle) => {
        remove = () => {
          void handle.remove();
        };
      });
    });
    return () => remove();
  }, []);

  useEffect(() => {
    if (huaweiAppLinking !== true && huaweiAlertPush !== true) return;
    let remove = () => {};
    if (huaweiAlertPush === true) {
      void import("@/lib/huawei/platform-client").then((mod) => mod.registerHuaweiAlertPush(true));
    }
    if (huaweiAppLinking !== true) return () => remove();
    void import("@capacitor/app").then(({ App }) =>
      App.addListener("appUrlOpen", (event) => {
        void import("@/lib/huawei/platform").then(({ huaweiAppLinkPath }) => {
          const path = huaweiAppLinkPath(true, event.url);
          if (path) window.location.assign(path);
        });
      }).then((handle) => {
        remove = () => {
          void handle.remove();
        };
      }),
    );
    return () => remove();
  }, [huaweiAppLinking, huaweiAlertPush]);

  useLayoutEffect(() => {
    const stop = startChannelListener();
    const root = document.documentElement;
    if (isStandalone()) root.classList.add("standalone");
    else root.classList.remove("standalone");
    return stop;
  }, []);

  useEffect(() => {
    const timeZone = readClientTimeZone();
    const rawSaved = readSavedOrigin();
    const saved = trustedSavedOrigin(rawSaved, { timeZone });
    if (rawSaved && !saved) clearSavedOrigin();
    if (urlHasGeocodableSearchQuery()) {
      setLocated(true);
      return;
    }
    if (saved) setOrigin({ ...saved, explicit: rawSaved?.explicit === true }, "saved");
    setLocated(true);
    let cancelled = false;
    const consent = readLocationConsent();
    // Remembered consent permits silent refresh, not a new system prompt.
    const askGps = consent === "granted";
    if (!askGps) {
      return () => {
        cancelled = true;
      };
    }
    void getDeviceLocation({ precise: true, allowPrompt: false }).then((pos) => {
      if (cancelled) return;
      if (pos) {
        const state = useAppStore.getState();
        if (
          !gpsMayMoveSearchOrigin({
            originSource: state.originSource,
            q: searchQueryFromUnknown(window.location.search),
          })
        ) {
          return;
        }
      }
      const resolved = resolveDefaultSearchOrigin({
        saved,
        gps: pos,
        gpsAllowed: true,
        timeZone,
      });
      if (resolved.source === "gps") {
        const here = locateHere(resolved.lat, resolved.lng);
        setOrigin(
          {
            lat: here.lat,
            lng: here.lng,
            label: here.label || reverseGeocode(here.lat, here.lng),
            explicit: true,
          },
          "gps",
        );
      } else if (resolved.source === "saved" && saved) {
        setOrigin({ ...resolved, explicit: true }, "saved");
      }
      setLocated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [setOrigin, setLocated]);

  return null;
}
