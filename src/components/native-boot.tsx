import { useEffect, useState } from "react";
import { BrandMark } from "@/components/brand-mark";
import { captureInstallPrompt, getDeviceLocation, hideNativeSplash, isStandalone, paintStatusBar } from "@/lib/native";
import { readSavedOrigin, reverseGeocode } from "@/lib/geo";
import { useAppStore } from "@/lib/store";

export function NativeBoot() {
  const [splash, setSplash] = useState(false);
  const setOrigin = useAppStore((s) => s.setOrigin);
  const setLocated = useAppStore((s) => s.setLocated);

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
    const root = document.documentElement;
    if (isStandalone()) root.classList.add("standalone");
    else root.classList.remove("standalone");
  }, []);

  useEffect(() => {
    const saved = readSavedOrigin();
    if (saved) setOrigin(saved);
    if (sessionStorage.getItem("kidease-geo-done") === "1") {
      setLocated(true);
      return;
    }
    sessionStorage.setItem("kidease-geo-done", "1");
    void getDeviceLocation().then((pos) => {
      if (!pos) {
        setLocated(true);
        return;
      }
      setOrigin({
        lat: pos.lat,
        lng: pos.lng,
        label: reverseGeocode(pos.lat, pos.lng),
      });
    });
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
