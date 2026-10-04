import { useEffect, useLayoutEffect } from "react";
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
import { readLocaleCookie, writeLocaleChoiceCookie } from "@/lib/locale-geo";
import { isFrPath } from "@/lib/locale-path";
import { useAppStore } from "@/lib/store";
import { readDistanceUnit } from "@/lib/units";
import { readLocationConsent } from "@/lib/location-consent";
import { bindAndroidBack } from "@/lib/android-back";
import { usePushRegistration } from "@/lib/use-push";
import { applyTheme, readThemePreference } from "@/lib/theme";

/**
 * Web boot must never paint a full-screen BrandMark. Without CSS an in-flow
 * mark can still cover the home page. Capacitor already has its own splash —
 * we only hide it here.
 */
export function NativeBoot() {
  usePushRegistration();
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
      const cookie = readLocaleCookie(document.cookie);
      const lock = (code: typeof cookie) => {
        if (!code) return;
        if (!isExtraLocale(code)) {
          setLocale(code, { lock: true });
          return;
        }
        void activateLocale(code).then((ok) => {
          if (ok) setLocale(code, { lock: true });
        });
      };
      if (cookie) {
        lock(cookie);
        return;
      }
      const raw = window.localStorage.getItem("kidease-locale");
      const saved = localeFromPreference(raw);
      // The old boot wrote "en" for everyone. Only a non-English value is a real choice.
      if (raw && saved !== "en") {
        writeLocaleChoiceCookie(saved);
        lock(saved);
        return;
      }
      if (isFrPath(window.location.pathname)) setLocale("fr");
    } catch {
      /* ignore */
    }
  }, [setLocale]);

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
    captureInstallPrompt();
    registerOfflineShell();
    void paintStatusBar();
    void hideNativeSplash();
  }, []);

  useEffect(() => {
    let remove = () => {};
    let cancelled = false;
    void bindAndroidBack(
      () => window.history.back(),
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
    const askGps =
      consent === "granted" || (consent !== "denied" && (isStandalone() || isNative()));
    if (!askGps) {
      return () => {
        cancelled = true;
      };
    }
    void getDeviceLocation({ precise: true }).then((pos) => {
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
