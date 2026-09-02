import { useEffect } from "react";
import { locateHere } from "@/lib/proximity";
import { movedEnough } from "@/lib/presence";
import { watchDeviceLocation } from "@/lib/native";
import { useAppStore } from "@/lib/store";
import { publishFix } from "@/lib/location-stream";
import { trackLocation } from "@/lib/telemetry";

/** Live GPS fabric while Explore is open. Raw GPS stays in this session. */
export function useLivePresence(active: boolean) {
  useEffect(() => {
    if (!active) return undefined;
    return watchDeviceLocation((pos) => {
      const { origin, setOrigin, touchGps, radiusKm } = useAppStore.getState();
      if (!movedEnough(origin, pos)) {
        touchGps();
        publishFix(origin.lat, origin.lng, origin.label);
        trackLocation("heartbeat", origin.lat, origin.lng, origin.label, { radiusKm });
        return;
      }
      const here = locateHere(pos.lat, pos.lng);
      setOrigin({ lat: here.lat, lng: here.lng, label: here.label }, "gps");
      publishFix(here.lat, here.lng, here.label);
      trackLocation("locate", here.lat, here.lng, here.label, { radiusKm });
    });
  }, [active]);
}
