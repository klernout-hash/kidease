import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { BrandMark } from "@/components/brand-mark";
import { captureInstallPrompt, getDeviceLocation, hideNativeSplash, isStandalone, paintStatusBar } from "@/lib/native";
import { locateHere } from "@/lib/proximity";
import { paintRuntime, isApp } from "@/lib/runtime";
import { readSavedOrigin } from "@/lib/geo";
import { LANGUAGES } from "@/lib/languages";
import { useAppStore } from "@/lib/store";
import type { Locale } from "@/lib/types";

export function NativeBoot() {
  const [splash, setSplash] = useState(false);
  const navigate = useNavigate();
  const setOrigin = useAppStore((s) => s.setOrigin);
  const setLocated = useAppStore((s) => s.setLocated);
  const setLocale = useAppStore((s) => s.setLocale);
  const setLiveOnly = useAppStore((s) => s.setLiveOnly);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("kidease-locale");
      if (saved && LANGUAGES.some((l) => l.code === saved)) setLocale(saved as Locale);
      if (window.localStorage.getItem("kidease-live-only") === "0") setLiveOnly(false);
    } catch {
      /* ignore */
    }
  }, [setLocale, setLiveOnly]);

  useEffect(() => {
    captureInstallPrompt();
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
    const id = window.setTimeout(() => {
      void import("leaflet");
      void import("leaflet/dist/leaflet.css");
    }, 400);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    paintRuntime();
    const root = document.documentElement;
    if (isStandalone()) root.classList.add("standalone");
    else root.classList.remove("standalone");
  }, []);

  useEffect(() => {
    if (!isApp()) return;
    if (window.location.pathname === "/" || window.location.pathname === "") {
      void navigate({ to: "/search", replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    const saved = readSavedOrigin();
    if (saved) setOrigin(saved);
    let cancelled = false;
    void getDeviceLocation().then((pos) => {
      if (cancelled) return;
      if (pos) {
        const here = locateHere(pos.lat, pos.lng);
        setOrigin({
          lat: here.lat,
          lng: here.lng,
          label: here.label,
        }, "gps");
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
