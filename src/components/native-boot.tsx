import { useEffect, useLayoutEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
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
import { canadaOriginOrWinnipeg, isInCanada } from "@/lib/canada-origin";
import { readSavedOrigin, WINNIPEG } from "@/lib/geo";
import { LANGUAGES } from "@/lib/languages";
import { useAppStore } from "@/lib/store";
import type { Locale } from "@/lib/types";
import { readDistanceUnit } from "@/lib/units";
import { readLocationConsent } from "@/lib/location-consent";
import { usePushRegistration } from "@/lib/use-push";

export function NativeBoot() {
  usePushRegistration();
  const [splash, setSplash] = useState(false);
  const setOrigin = useAppStore((s) => s.setOrigin);
  const setLocated = useAppStore((s) => s.setLocated);
  const setLocale = useAppStore((s) => s.setLocale);
  const setLiveOnly = useAppStore((s) => s.setLiveOnly);
  const setDistanceUnit = useAppStore((s) => s.setDistanceUnit);
  const setLocationConsent = useAppStore((s) => s.setLocationConsent);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("kidease-locale");
      if (saved && LANGUAGES.some((l) => l.code === saved)) setLocale(saved as Locale);
      const livePref = window.localStorage.getItem("kidease-live-only");
      if (livePref === "1") setLiveOnly(true);
      else if (livePref === "0") setLiveOnly(false);
      setDistanceUnit(readDistanceUnit());
      setLocationConsent(readLocationConsent());
    } catch {
      /* ignore */
    }
  }, [setLocale, setLiveOnly, setDistanceUnit, setLocationConsent]);

  useEffect(() => {
    captureInstallPrompt();
    registerOfflineShell();
    void paintStatusBar();
    const already = sessionStorage.getItem("dn-splashed") === "1";
    if (!already && isStandalone()) {
      setSplash(true);
      const t = window.setTimeout(() => {
        setSplash(false);
        sessionStorage.setItem("dn-splashed", "1");
        void hideNativeSplash();
      }, 900);
      return () => window.clearTimeout(t);
    }
    void hideNativeSplash();
    return undefined;
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
    const saved = readSavedOrigin();
    setOrigin(canadaOriginOrWinnipeg(saved));
    setLocated(true);
    let cancelled = false;
    const consent = readLocationConsent();
    const askGps = consent === "granted" || (consent !== "denied" && (isStandalone() || isNative()));
    if (!askGps) {
      return () => {
        cancelled = true;
      };
    }
    void getDeviceLocation({ precise: true }).then((pos) => {
      if (cancelled) return;
      if (pos && isInCanada(pos.lat, pos.lng)) {
        const here = locateHere(pos.lat, pos.lng);
        setOrigin(
          {
            lat: here.lat,
            lng: here.lng,
            label: here.label,
          },
          "gps",
        );
      } else if (!saved || !isInCanada(saved.lat, saved.lng)) {
        setOrigin(WINNIPEG);
      }
      setLocated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [setOrigin, setLocated]);

  if (!splash) return null;

  return (
    <div
      className="fixed inset-0 z-[80] grid place-items-center bg-bg text-primary"
      role="status"
      aria-label="KidEase"
    >
      <BrandMark size="lg" />
    </div>
  );
}
