import { useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { LocateFixed, Minus, Navigation, Plus, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { CopyKey } from "@/lib/copy";
import type { DaycareCard, Locale } from "@/lib/types";
import { cn, displayCentreName, displayListingText, money } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { useCopy } from "@/lib/use-copy";
import { getDeviceLocation, hapticLight } from "@/lib/native";
import {
  MAP_RADIUS_FIT_PAD,
  mapZoomForRadius,
  openDirections,
  placePinPopup,
  radiusFitPadding,
  readMapBase,
  writeMapBase,
  type MapBase,
  type PinPopupBox,
} from "@/lib/maps";
import { bboxFromRadius } from "@/lib/proximity";
import {
  RADIUS_CIRCLE_ALT_STYLE,
  RADIUS_CIRCLE_STYLE,
  boundsCoverRadiusFrame,
  radiusCircleFrame,
  radiusFrameKey,
} from "@/lib/map-radius-frame";
import { mapPinToCard } from "@/lib/map-pin-card";
import {
  MAP_FETCH_DEBOUNCE_MS,
  bboxCovers,
  cacheMapBbox,
  clusterAriaLabel,
  clusterBubbleFontPx,
  clusterBubblePx,
  clusterCountLabel,
  clusterStepZoom,
  MAP_DOT_HIT_PX,
  mapLogoPinPx,
  mapPinTapPx,
  mapViewCacheKey,
  markersForMapView,
  pickNearestMapDot,
  viewportNeedsFetch,
  readMapViewCache,
  sanitizeMapBbox,
  writeMapViewCache,
  type MapPin,
  type MapViewData,
} from "@/lib/map-cluster";
import { mapPinsInView } from "@/lib/server/map-pins";
import {
  createKidEaseMap,
  createListingOverlayFactory,
  createYouAreHereDot,
  googleMapTypeId,
  GOOGLE_MAPS_BROWSER_ENV,
  hasGoogleMapsBrowserKey,
  loadAdvancedMarkerElement,
  loadGoogleMaps,
  MAP_VIEW_WAIT_MS,
  type AdvancedMarkerCtor,
  type ListingOverlay,
  type MovableDot,
} from "@/lib/google-maps";
import { BuildingPhoto } from "@/components/building-photo";
import { mapPinThumb } from "@/lib/listing-photo";
import { listingAgeRangeText } from "@/lib/listing-ages";
import { displayDistance } from "@/lib/units";
import { honestVacancy } from "@/lib/now-loops";
import { publicApprovalEligible } from "@/lib/approve-live";

type Props = {
  items: DaycareCard[];
  origin: { lat: number; lng: number };
  secondOrigin?: { lat: number; lng: number } | null;
  radiusKm: number;
  /** List-card hover. The popup opens only after a pin tap, not from this. */
  activeSlug?: string | null;
  onSelect: (slug: string | null) => void;
  onRelocate?: (pos: { lat: number; lng: number }) => void;
  onLocate?: () => void;
  onFallback?: () => void;
};

/** Brand map pin — same smiling teardrop as the KidEase logo. */
const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">
  <path fill="#ffffff" d="M50 3c22 0 40 17.4 40 39.2 0 16-10 29.4-25.2 42.2L50 99 35.2 84.4C20 71.6 10 58.2 10 42.2 10 20.4 28 3 50 3z"/>
  <path fill="#1A3790" d="M50 6c20.4 0 37 16.2 37 36.2 0 14.6-9.2 27.4-23.4 39.2L50 96 36.4 81.4C22.2 69.6 13 56.8 13 42.2 13 22.2 29.6 6 50 6z"/>
  <circle cx="50" cy="42" r="22" fill="#fff"/>
  <path fill="none" stroke="#1A3790" stroke-width="4" stroke-linecap="round" d="M39 40c2.2-4 6.2-4 8.4 0"/>
  <path fill="none" stroke="#1A3790" stroke-width="4" stroke-linecap="round" d="M52.6 40c2.2-4 6.2-4 8.4 0"/>
  <path fill="none" stroke="#1A3790" stroke-width="4" stroke-linecap="round" d="M41 51c5.4 7 12.6 7 18 0"/>
</svg>`;

/** One shared image for every unselected pin. The browser decodes it once. */
const LOGO_PIN_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(PIN_SVG)}`;

function installLogoPinSprite() {
  if (typeof document === "undefined") return;
  if (document.head.querySelector("style[data-ke='logo-pin-sprite']")) return;
  const style = document.createElement("style");
  style.dataset.ke = "logo-pin-sprite";
  style.textContent = `.ke-map-logo-pin{background-image:url("${LOGO_PIN_URL}")}`;
  document.head.appendChild(style);
}

type AnyPin = {
  setMap(map: google.maps.Map | null): void;
};

type DotItem = DaycareCard | MapPin;

type SlugPin = AnyPin & {
  setActive(on: boolean, maps: typeof google.maps): void;
};

const MAP_CLUSTER_PAD = { top: 72, right: 64, bottom: 28, left: 16 };

export function MapView({
  items,
  origin,
  secondOrigin,
  radiusKm,
  onSelect,
  onRelocate,
  onLocate,
  onFallback,
}: Props) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const mapsApiRef = useRef<typeof google.maps | null>(null);
  const overlayFactoryRef = useRef<ReturnType<typeof createListingOverlayFactory> | null>(null);
  const advancedMarkerRef = useRef<AdvancedMarkerCtor | null>(null);
  const pinsRef = useRef<AnyPin[]>([]);
  const youRef = useRef<MovableDot | null>(null);
  const workYouRef = useRef<MovableDot | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const circle2Ref = useRef<google.maps.Circle | null>(null);
  const markersBySlug = useRef(new Map<string, SlugPin>());
  const popupRef = useRef<HTMLDivElement>(null);
  const popupBoxRef = useRef<PinPopupBox | null>(null);
  const popupPointRef = useRef<{ x: number; y: number; mapWidth: number; mapHeight: number } | null>(null);
  const popupSlugRef = useRef<string | null>(null);
  const pinClickAt = useRef(0);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const originRef = useRef(origin);
  originRef.current = origin;
  const secondOriginRef = useRef(secondOrigin);
  secondOriginRef.current = secondOrigin ?? null;
  const radiusRef = useRef(radiusKm);
  radiusRef.current = radiusKm;
  /** Set when the parent pans or zooms. Cleared when the search or radius changes. */
  const userMovedRef = useRef(false);

  const locale = useAppStore((s) => s.locale);
  const { t } = useCopy();
  const [ready, setReady] = useState(false);
  const [basemapReady, setBasemapReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(() =>
    hasGoogleMapsBrowserKey() ? null : `${GOOGLE_MAPS_BROWSER_ENV} is not set`,
  );
  const [zoom, setZoom] = useState(12);
  const [base, setBase] = useState<MapBase>("roadmap");
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedPin, setPickedPin] = useState<MapPin | null>(null);
  const [viewData, setViewData] = useState<MapViewData | null>(null);
  const [locating, setLocating] = useState(false);
  const [loadGen, setLoadGen] = useState(0);
  const appliedViewKey = useRef("");
  const loadedView = useRef<MapViewData | null>(null);

  useEffect(() => {
    setBase(readMapBase());
  }, []);

  const selected = useMemo(() => {
    if (!picked) return null;
    const fromList = items.find((item) => item.slug === picked);
    if (fromList) return fromList;
    if (pickedPin && pickedPin.slug === picked) return mapPinToCard(pickedPin, origin);
    return null;
  }, [items, picked, pickedPin, origin]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const dismissRef = useRef<() => void>(() => {});
  dismissRef.current = () => {
    popupBoxRef.current = null;
    setPicked(null);
    onSelectRef.current(null);
  };

  useEffect(() => {
    if (!selected) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  useEffect(() => {
    const el = host.current;
    if (!el || !hasGoogleMapsBrowserKey()) return;
    let cancelled = false;
    let map: google.maps.Map | null = null;
    const markers = markersBySlug.current;

    void (async () => {
      const watchdog = window.setTimeout(() => {
        if (cancelled) return;
        setLoadError("Google Maps timed out");
        setBasemapReady(false);
        setReady(false);
      }, MAP_VIEW_WAIT_MS);
      try {
        const maps = await loadGoogleMaps();
        if (cancelled || !el) return;
        el.innerHTML = "";
        const framed = originRef.current;
        const created = await createKidEaseMap(maps, el, {
          center: { lat: framed.lat, lng: framed.lng },
          zoom: mapZoomForRadius(radiusRef.current),
          mapTypeId: googleMapTypeId(readMapBase()),
        });
        if (cancelled) return;
        map = created.map;
        // Google Maps can ignore a later fitBounds if it runs before the
        // projection exists. The load above may also have closed over a device
        // pin that the city query has since replaced. Pin the latest camera now.
        const latest = originRef.current;
        map.setCenter({ lat: latest.lat, lng: latest.lng });
        map.addListener("zoom_changed", () => {
          const next = map?.getZoom();
          if (typeof next === "number") setZoom(next);
        });
        const startZoom = map.getZoom();
        if (typeof startZoom === "number") setZoom(startZoom);
        const AdvancedMarker = await loadAdvancedMarkerElement(maps, created.usedMapId);
        if (cancelled) return;
        mapRef.current = map;
        mapsApiRef.current = maps;
        advancedMarkerRef.current = AdvancedMarker;
        overlayFactoryRef.current = createListingOverlayFactory(maps, AdvancedMarker);
        setLoadError(null);
        setBasemapReady(true);
        setReady(true);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Google Maps failed to load");
          setBasemapReady(false);
          setReady(false);
        }
      } finally {
        window.clearTimeout(watchdog);
      }
    })();

    return () => {
      cancelled = true;
      setReady(false);
      setBasemapReady(false);
      if (map) {
        window.google?.maps?.event.clearInstanceListeners(map);
      }
      for (const pin of pinsRef.current) pin.setMap(null);
      pinsRef.current = [];
      youRef.current?.setMap(null);
      youRef.current = null;
      workYouRef.current?.setMap(null);
      workYouRef.current = null;
      circleRef.current?.setMap(null);
      circleRef.current = null;
      circle2Ref.current?.setMap(null);
      circle2Ref.current = null;
      markers.clear();
      mapRef.current = null;
      mapsApiRef.current = null;
      overlayFactoryRef.current = null;
      advancedMarkerRef.current = null;
      el.innerHTML = "";
    };
    // Recreated on retry (loadGen). Origin/radius apply in later effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadGen]);

  useEffect(() => {
    const map = mapRef.current;
    const el = host.current;
    if (!map || !el || !ready) return;
    const ro = new ResizeObserver(() => {
      window.google?.maps?.event.trigger(map, "resize");
    });
    ro.observe(el);
    window.google?.maps?.event.trigger(map, "resize");
    return () => ro.disconnect();
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setMapTypeId(googleMapTypeId(base));
    writeMapBase(base);
  }, [base, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsApiRef.current;
    const el = host.current;
    if (!map || !maps || !el || !ready) return;
    const point = originRef.current;
    const frameKey = radiusFrameKey(point, radiusKm, secondOriginRef.current);
    userMovedRef.current = false;

    const fit = () => {
      const home = originRef.current;
      const other = secondOriginRef.current;
      const frame = radiusCircleFrame(home, radiusRef.current);
      const box = bboxFromRadius(home, frame.radiusKm);
      map.setCenter({ lat: home.lat, lng: home.lng });
      if (circleRef.current) {
        circleRef.current.setCenter({ lat: home.lat, lng: home.lng });
        circleRef.current.setRadius(frame.meters);
        circleRef.current.setOptions(RADIUS_CIRCLE_STYLE);
      } else {
        circleRef.current = new maps.Circle({
          map,
          center: { lat: home.lat, lng: home.lng },
          radius: frame.meters,
          ...RADIUS_CIRCLE_STYLE,
        });
      }
      if (other) {
        const work = radiusCircleFrame(other, radiusRef.current);
        if (circle2Ref.current) {
          circle2Ref.current.setCenter({ lat: other.lat, lng: other.lng });
          circle2Ref.current.setRadius(work.meters);
          circle2Ref.current.setOptions(RADIUS_CIRCLE_ALT_STYLE);
          circle2Ref.current.setMap(map);
        } else {
          circle2Ref.current = new maps.Circle({
            map,
            center: { lat: other.lat, lng: other.lng },
            radius: work.meters,
            ...RADIUS_CIRCLE_ALT_STYLE,
          });
        }
        if (workYouRef.current) {
          workYouRef.current.setPosition({ lat: other.lat, lng: other.lng });
          workYouRef.current.setMap(map);
        } else {
          workYouRef.current = createYouAreHereDot({
            maps,
            map,
            position: { lat: other.lat, lng: other.lng },
            AdvancedMarker: advancedMarkerRef.current,
          });
        }
      } else {
        circle2Ref.current?.setMap(null);
        workYouRef.current?.setMap(null);
      }
      const bounds = new maps.LatLngBounds(
        { lat: box.minLat, lng: box.minLng },
        { lat: box.maxLat, lng: box.maxLng },
      );
      if (other) {
        const workBox = bboxFromRadius(other, frame.radiusKm);
        bounds.extend({ lat: workBox.minLat, lng: workBox.minLng });
        bounds.extend({ lat: workBox.maxLat, lng: workBox.maxLng });
      }
      const pad = el.clientWidth > 0 ? radiusFitPadding(el.clientWidth) : MAP_RADIUS_FIT_PAD;
      map.fitBounds(bounds, pad);
      youRef.current?.setPosition({ lat: home.lat, lng: home.lng });
    };

    fit();
    let framing = true;
    const markMoved = () => {
      userMovedRef.current = true;
    };
    const idle = maps.event?.addListenerOnce?.(map, "idle", () => {
      if (!framing || userMovedRef.current) return;
      const home = originRef.current;
      const frame = radiusCircleFrame(home, radiusRef.current);
      const visible = map.getBounds?.();
      const ne = visible?.getNorthEast?.();
      const sw = visible?.getSouthWest?.();
      const framed =
        ne &&
        sw &&
        boundsCoverRadiusFrame(
          { minLat: sw.lat(), maxLat: ne.lat(), minLng: sw.lng(), maxLng: ne.lng() },
          frame,
        );
      if (framed) return;
      fit();
    });
    const drag = maps.event.addListener(map, "dragstart", markMoved);
    el.addEventListener("wheel", markMoved, { passive: true });
    el.addEventListener("touchmove", markMoved, { passive: true });
    el.addEventListener("dblclick", markMoved);
    let resizeTimer = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        if (!framing || userMovedRef.current) return;
        if (radiusFrameKey(originRef.current, radiusRef.current, secondOriginRef.current) !== frameKey) return;
        maps.event.trigger(map, "resize");
        fit();
      }, 80);
    });
    ro.observe(el);
    if (youRef.current) {
      youRef.current.setPosition({ lat: point.lat, lng: point.lng });
    } else {
      youRef.current = createYouAreHereDot({
        maps,
        map,
        position: { lat: point.lat, lng: point.lng },
        AdvancedMarker: advancedMarkerRef.current,
      });
    }
    return () => {
      framing = false;
      window.clearTimeout(resizeTimer);
      ro.disconnect();
      el.removeEventListener("wheel", markMoved);
      el.removeEventListener("touchmove", markMoved);
      el.removeEventListener("dblclick", markMoved);
      if (idle) maps.event?.removeListener?.(idle);
      maps.event.removeListener(drag);
    };
  }, [origin.lat, origin.lng, secondOrigin?.lat, secondOrigin?.lng, radiusKm, ready]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsApiRef.current;
    if (!map || !maps || !ready) return;
    let cancelled = false;
    let timer = 0;
    let request = 0;
    let inflightKey = "";
    const run = () => {
      const bounds = map.getBounds?.();
      const ne = bounds?.getNorthEast?.();
      const sw = bounds?.getSouthWest?.();
      const zoomNow = map.getZoom?.();
      if (!ne || !sw || typeof zoomNow !== "number") return;
      const visible = sanitizeMapBbox({
        minLat: sw.lat(),
        maxLat: ne.lat(),
        minLng: sw.lng(),
        maxLng: ne.lng(),
      });
      if (!visible) return;
      const loaded = loadedView.current;
      if (
        !viewportNeedsFetch({
          visible,
          zoom: zoomNow,
          loaded: loaded ? { bbox: loaded.bbox, zoom: loaded.zoom, mode: loaded.mode } : null,
        })
      ) {
        return;
      }
      const key = mapViewCacheKey(visible, zoomNow);
      const cached = readMapViewCache(key);
      if (cached && bboxCovers(cached.bbox, visible)) {
        if (appliedViewKey.current !== key) {
          appliedViewKey.current = key;
          loadedView.current = cached;
          setViewData(cached);
        }
        return;
      }
      if (inflightKey === key) return;
      inflightKey = key;
      const id = ++request;
      const snapped = cacheMapBbox(visible, zoomNow);
      void mapPinsInView({ data: { ...snapped, zoom: zoomNow } })
        .then((data) => {
          if (inflightKey === key) inflightKey = "";
          if (cancelled || id !== request || !data || data.truncated) return;
          writeMapViewCache(key, data);
          appliedViewKey.current = key;
          loadedView.current = data;
          setViewData(data);
        })
        .catch(() => {
          if (inflightKey === key) inflightKey = "";
        });
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, MAP_FETCH_DEBOUNCE_MS);
    };
    const listener = maps.event.addListener(map, "idle", schedule);
    schedule();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      maps.event.removeListener(listener);
    };
  }, [ready]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsApiRef.current;
    const createOverlay = overlayFactoryRef.current;
    if (!map || !maps || !createOverlay || !ready) return;

    const timer = window.setTimeout(() => {
      for (const pin of pinsRef.current) pin.setMap(null);
      pinsRef.current = [];
      markersBySlug.current.clear();

      const bounds = map.getBounds?.();
      const ne = bounds?.getNorthEast?.();
      const sw = bounds?.getSouthWest?.();
      const frame =
        ne && sw
          ? sanitizeMapBbox({
              minLat: sw.lat(),
              maxLat: ne.lat(),
              minLng: sw.lng(),
              maxLng: ne.lng(),
            })
          : null;
      const drawn = markersForMapView({
        items,
        view: viewData,
        zoom,
        bounds: frame,
        atLat: originRef.current.lat,
      });
      const nextPins: AnyPin[] = [];
      const dotPins: DotItem[] = [];
      for (const node of drawn.markers) {
        if (node.kind === "group") {
          const content = clusterEl(node.count, locale === "fr" ? "fr" : "en");
          const overlay = createOverlay({
            map,
            position: { lat: node.lat, lng: node.lng },
            content,
            centered: true,
            zIndex: 40 + Math.min(node.count, 80),
            collision: "REQUIRED",
            onClick: () => {
              userMovedRef.current = true;
              if (clusterStepZoom(node)) {
                map.setZoom(Math.min((map.getZoom() ?? zoom) + 2, 17));
                map.panTo({ lat: node.lat, lng: node.lng });
                return;
              }
              const box = new maps.LatLngBounds(
                { lat: node.minLat, lng: node.minLng },
                { lat: node.maxLat, lng: node.maxLng },
              );
              if (!box.isEmpty()) map.fitBounds(box, MAP_CLUSTER_PAD);
            },
          });
          nextPins.push(overlay);
          continue;
        }
        dotPins.push(node.item);
      }
      const selectedItem = dotPins.find((item) => item.slug === picked);
      const field = mountDotField({
        maps,
        map,
        zoom,
        pins: dotPins.filter((item) => item !== selectedItem),
        locale: locale === "fr" ? "fr" : "en",
        onPick: (item) => {
          pinClickAt.current = Date.now();
          if (!("fromPrice" in item)) setPickedPin(item);
          setPicked(item.slug);
          onSelectRef.current(item.slug);
        },
      });
      nextPins.push(field);
      if (selectedItem && Number.isFinite(selectedItem.lat) && Number.isFinite(selectedItem.lng)) {
        const content = logoPinEl("ke-logo-pin is-active");
        content.setAttribute("aria-label", pinLabel(selectedItem, locale === "fr" ? "fr" : "en"));
        content.setAttribute("aria-expanded", "true");
        const overlay = createOverlay({
          map,
          position: { lat: selectedItem.lat, lng: selectedItem.lng },
          content,
          zIndex: 500,
          collision: "REQUIRED",
          onClick: () => {
            pinClickAt.current = Date.now();
            if (!("fromPrice" in selectedItem)) setPickedPin(selectedItem);
            setPicked(selectedItem.slug);
            onSelectRef.current(selectedItem.slug);
          },
        });
        nextPins.push(overlay);
        markersBySlug.current.set(selectedItem.slug, wrapOverlayPin(overlay));
      }
      pinsRef.current = nextPins;
    }, 50);

    return () => window.clearTimeout(timer);
  }, [items, locale, picked, ready, zoom, viewData]);

  useEffect(() => {
    const maps = mapsApiRef.current;
    if (!maps) return;
    for (const [id, pin] of markersBySlug.current) {
      pin.setActive(id === picked, maps);
    }
  }, [picked, zoom, items]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsApiRef.current;
    if (!map || !maps || !ready) return;
    const listener = maps.event.addListener(map, "click", () => {
      if (Date.now() - pinClickAt.current < 400) return;
      dismissRef.current();
    });
    return () => {
      maps.event.removeListener(listener);
    };
  }, [ready]);

  const popupSlug = selected?.slug ?? null;
  if (popupSlugRef.current !== popupSlug) {
    popupSlugRef.current = popupSlug;
    popupBoxRef.current = null;
    popupPointRef.current = null;
  }

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsApiRef.current;
    const slug = selected?.slug;
    const lat = selected?.lat;
    const lng = selected?.lng;
    if (!map || !maps || !slug || !Number.isFinite(lat) || !Number.isFinite(lng) || !ready) return;

    let overlay: google.maps.OverlayView | null = null;
    const place = () => {
      const el = popupRef.current;
      const hostEl = host.current;
      const current = selectedRef.current;
      const projection = overlay?.getProjection();
      if (!el || !hostEl || !current || !projection) return;
      const point = projection.fromLatLngToContainerPixel(new maps.LatLng(current.lat, current.lng));
      if (!point) return;
      popupPointRef.current = {
        x: point.x,
        y: point.y,
        mapWidth: hostEl.clientWidth,
        mapHeight: hostEl.clientHeight,
      };
      const box = measurePinPopup(el, popupPointRef.current);
      if (!box) return;
      popupBoxRef.current = box;
      applyPinPopupBox(el, box);
    };

    overlay = new maps.OverlayView();
    overlay.onAdd = () => {};
    overlay.draw = () => place();
    overlay.onRemove = () => {};
    overlay.setMap(map);
    const idle = maps.event?.addListener?.(map, "idle", place);
    const raf = window.requestAnimationFrame(place);
    return () => {
      window.cancelAnimationFrame(raf);
      if (idle) maps.event?.removeListener?.(idle);
      overlay?.setMap(null);
    };
  }, [ready, selected?.slug, selected?.lat, selected?.lng]);

  useLayoutEffect(() => {
    const el = popupRef.current;
    const point = popupPointRef.current;
    if (!el || !point) {
      el?.classList.remove("is-placed");
      return;
    }
    const box = measurePinPopup(el, point);
    if (!box) return;
    popupBoxRef.current = box;
    applyPinPopupBox(el, box);
  });

  async function locateMe() {
    userMovedRef.current = true;
    if (onLocate) {
      onLocate();
      return;
    }
    setLocating(true);
    const pos = await getDeviceLocation({ precise: true });
    setLocating(false);
    if (!pos) return;
    mapRef.current?.panTo({ lat: pos.lat, lng: pos.lng });
    mapRef.current?.setZoom(13);
    void hapticLight();
    onRelocate?.(pos);
  }

  function bumpZoom(delta: number) {
    userMovedRef.current = true;
    const map = mapRef.current;
    if (!map) return;
    const next = Math.min(18, Math.max(4, (map.getZoom() ?? zoom) + delta));
    map.setZoom(next);
  }

  return (
    <div className="relative size-full min-h-[280px] overflow-hidden rounded-lg bg-map">
      <div ref={host} className="ke-map-host absolute inset-0" />

      {loadError ? (
        <div className="absolute inset-0 z-[1] grid place-items-center bg-map px-6 text-center">
          <div className="max-w-sm">
            <p className="text-sm text-muted">{t("mapUnavailable")}</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                className="inline-flex h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg"
                onClick={() => {
                  setLoadError(null);
                  setBasemapReady(false);
                  setReady(false);
                  setLoadGen((n) => n + 1);
                }}
              >
                {t("mapRetry")}
              </button>
              {onFallback ? (
                <button
                  type="button"
                  className="inline-flex h-11 items-center rounded-full bg-surface px-4 text-sm font-semibold text-fg ring-1 ring-border"
                  onClick={onFallback}
                >
                  {t("mapShowList")}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : !basemapReady ? (
        <div
          className="ke-map-skel pointer-events-none absolute inset-0 z-[1] grid place-items-center px-6 text-center"
          role="status"
          aria-live="polite"
        >
          <p className="text-sm font-medium text-muted">{t("mapLoading")}</p>
        </div>
      ) : null}

      <div className="pointer-events-none absolute inset-x-0 top-0 z-[400] h-16 bg-gradient-to-b from-bg/55 to-transparent lg:h-8" />

      <div className="pointer-events-none absolute left-3 top-[4.6rem] z-[400] lg:top-3">
        <span className="inline-flex items-center rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-fg shadow-card ring-1 ring-border">
          {t("mapSearchRadius")
            .replace("{n}", displayDistance(radiusKm, "km"))
            .replace("{u}", t("km"))}
        </span>
      </div>

      <div className="ke-map-controls absolute right-3 top-[4.6rem] z-[400] flex flex-col items-end gap-2 lg:top-3">
        <div className="overflow-hidden rounded-full bg-surface text-xs font-medium shadow-card ring-1 ring-border">
          <button
            type="button"
            className={cn("px-3 py-1.5", base === "roadmap" ? "bg-primary text-primary-fg" : "text-muted")}
            onClick={() => setBase("roadmap")}
          >
            {t("mapRoad")}
          </button>
          <button
            type="button"
            className={cn("px-3 py-1.5", base === "satellite" ? "bg-primary text-primary-fg" : "text-muted")}
            onClick={() => setBase("satellite")}
          >
            {t("mapSat")}
          </button>
        </div>
        <button
          type="button"
          onClick={() => void locateMe()}
          disabled={locating}
          className="grid size-11 place-items-center rounded-full bg-surface text-primary shadow-card ring-1 ring-border"
          aria-label={t("useLocation")}
        >
          <LocateFixed className={cn("size-5", locating && "animate-pulse")} />
        </button>
        <div className="overflow-hidden rounded-full bg-surface shadow-card ring-1 ring-border">
          <button
            type="button"
            onClick={() => bumpZoom(1)}
            className="grid size-11 place-items-center text-fg hover:bg-surface-2"
            aria-label="Zoom in"
          >
            <Plus className="size-4" strokeWidth={2.2} />
          </button>
          <span className="mx-auto block h-px w-6 bg-border" aria-hidden />
          <button
            type="button"
            onClick={() => bumpZoom(-1)}
            className="grid size-11 place-items-center text-fg hover:bg-surface-2"
            aria-label="Zoom out"
          >
            <Minus className="size-4" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      {selected ? (
        <MapPinPopup
          popupRef={popupRef}
          item={selected}
          locale={locale}
          onClose={() => dismissRef.current()}
          t={t}
        />
      ) : null}
    </div>
  );
}

function measurePinPopup(
  el: HTMLElement,
  point: { x: number; y: number; mapWidth: number; mapHeight: number },
) {
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  if (width < 8 || height < 8) return null;
  return placePinPopup({
    pointX: point.x,
    pointY: point.y,
    width,
    height,
    mapWidth: point.mapWidth,
    mapHeight: point.mapHeight,
    padTop: 52,
    padRight: 64,
  });
}

function applyPinPopupBox(el: HTMLElement, box: PinPopupBox) {
  el.style.left = `${box.left}px`;
  el.style.top = `${box.top}px`;
  el.style.setProperty("--ke-caret-x", `${box.caretX}px`);
  el.dataset.placement = box.placement;
  el.classList.add("is-placed");
}

function MapPinPopup({
  item,
  popupRef,
  locale,
  onClose,
  t,
}: {
  item: DaycareCard;
  popupRef: RefObject<HTMLDivElement | null>;
  locale: Locale;
  onClose: () => void;
  t: (key: CopyKey) => string;
}) {
  const name = displayCentreName(locale === "fr" ? item.nameFr || item.name : item.name);
  const away = Number.isFinite(item.distanceKm)
    ? `${displayDistance(item.distanceKm, "km")} ${t("km")}`
    : "";
  const place = [item.city || displayListingText(item.address), away].filter(Boolean).join(" · ");
  const ages = listingAgeRangeText(item, "months", locale === "fr" ? "fr" : "en");
  const vacancy = honestVacancy(item);
  const facts = [
    ages,
    vacancy.kind === "open" && vacancy.spots > 0 ? `${vacancy.spots} ${t("spots")}` : "",
    item.live && item.fromPrice > 0 ? `${money(item.fromPrice, locale)}${t("month")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const approved = publicApprovalEligible(item);
  const thumb = mapPinThumb(item.photos);

  return (
    <div
      ref={popupRef}
      data-ke="map-selected-card"
      data-placement="above"
      role="dialog"
      aria-label={name}
      className="ke-pin-popup rounded-[14px] bg-surface text-fg shadow-card ring-1 ring-border"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        data-ke="map-pin-popup-close"
        className="absolute right-0 top-0 z-[1] grid size-11 place-items-center text-muted"
        aria-label={t("close")}
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
      >
        <X className="size-4" strokeWidth={2.4} />
      </button>
      <Link
        to="/daycare/$slug"
        params={{ slug: item.slug }}
        className="flex items-start gap-2 px-2 pb-1.5 pt-2 text-inherit no-underline"
      >
        {thumb ? (
          <span data-ke="map-pin-photo" className="mt-0.5 shrink-0">
            <BuildingPhoto
              src={thumb}
              className="aspect-[4/3] w-16 rounded-md object-cover"
              sizes="64px"
              width={128}
              height={96}
            />
          </span>
        ) : null}
        <span className="min-w-0 flex-1 pr-9">
          <p className="line-clamp-2 text-[15px] font-semibold leading-5 tracking-[-0.02em]">{name}</p>
          {place ? <p className="mt-0.5 truncate text-[13px] leading-5 text-muted">{place}</p> : null}
          {facts ? <p className="mt-0.5 truncate text-[13px] leading-5 text-muted">{facts}</p> : null}
          {approved ? (
            <p className="mt-0.5 text-[12px] font-medium leading-4 text-primary" data-ke="kidease-approved-marker">
              {t("kideaseApprovedMarker")}
            </p>
          ) : null}
        </span>
      </Link>
      <div className="px-2 pb-2">
        <button
          type="button"
          data-ke="map-pin-directions"
          className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-[12px] bg-surface-2 text-sm font-semibold ring-1 ring-border"
          onClick={(event) => {
            event.stopPropagation();
            void openDirections(item.lat, item.lng, name, {
              address: displayListingText(item.address),
              city: item.city,
              province: item.province,
              postalCode: item.postalCode,
            });
          }}
        >
          <Navigation className="size-4" />
          {t("getDirections")}
        </button>
      </div>
      <span className="ke-pin-caret" aria-hidden />
    </div>
  );
}

function pinLabel(item: { name: string; nameFr?: string }, locale: "en" | "fr") {
  return displayCentreName(locale === "fr" ? item.nameFr || item.name : item.name);
}

function mountDotField(input: {
  maps: typeof google.maps;
  map: google.maps.Map;
  zoom: number;
  pins: DotItem[];
  locale: "en" | "fr";
  onPick: (item: DotItem) => void;
}): AnyPin {
  const { maps, map, zoom, pins, locale, onPick } = input;
  const drawPx = mapLogoPinPx(zoom);
  const tapPx = mapPinTapPx(zoom);
  const hitPx = Math.max(MAP_DOT_HIT_PX, tapPx / 2);
  const buttons: HTMLButtonElement[] = [];
  const placed: DotItem[] = [];
  let wrap: HTMLDivElement | null = null;
  const field = new maps.OverlayView();
  field.onAdd = () => {
    installLogoPinSprite();
    const layer = document.createElement("div");
    layer.className = "ke-map-dots";
    const choose = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const centers = buttons.map((el) => {
        const rect = el.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      });
      const hit = pickNearestMapDot(placed, centers, { x: event.clientX, y: event.clientY }, hitPx);
      if (hit) onPick(hit);
    };
    for (const item of pins) {
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ke-map-logo-pin";
      button.style.width = `${tapPx}px`;
      button.style.height = `${tapPx}px`;
      button.style.setProperty("--ke-pin-draw", `${drawPx}px`);
      button.setAttribute("aria-label", pinLabel(item, locale));
      button.addEventListener("click", choose);
      layer.appendChild(button);
      buttons.push(button);
      placed.push(item);
    }
    wrap = layer;
    field.getPanes()?.overlayMouseTarget.appendChild(layer);
  };
  field.draw = () => {
    const projection = field.getProjection();
    if (!projection) return;
    let index = 0;
    for (const item of pins) {
      if (!Number.isFinite(item.lat) || !Number.isFinite(item.lng)) continue;
      const button = buttons[index];
      index += 1;
      if (!button) continue;
      const point = projection.fromLatLngToDivPixel(new maps.LatLng(item.lat, item.lng));
      if (!point) continue;
      button.style.transform = `translate(${point.x}px, ${point.y}px) translate(-50%, -100%)`;
    }
  };
  field.onRemove = () => {
    wrap?.remove();
    wrap = null;
  };
  field.setMap(map);
  return field;
}

function logoPinEl(className: string) {
  const content = document.createElement("div");
  content.className = className;
  content.innerHTML = PIN_SVG;
  content.setAttribute("role", "button");
  content.setAttribute("aria-expanded", "false");
  return content;
}

function clusterEl(count: number, locale: "en" | "fr") {
  const content = document.createElement("button");
  content.type = "button";
  content.className = "ke-logo-cluster ke-cluster-bubble";
  const size = clusterBubblePx(count);
  content.style.setProperty("--ke-cluster-size", `${size}px`);
  content.style.width = `${size}px`;
  content.style.height = `${size}px`;
  content.style.fontSize = `${clusterBubbleFontPx(count)}px`;
  content.textContent = clusterCountLabel(count);
  content.setAttribute("aria-label", clusterAriaLabel(count, locale));
  return content;
}

function wrapOverlayPin(overlay: ListingOverlay): SlugPin {
  return {
    setMap(map) {
      overlay.setMap(map);
    },
    setActive(on) {
      const el = overlay.getElement();
      el.classList.toggle("is-active", on);
      el.setAttribute("aria-expanded", on ? "true" : "false");
      overlay.setZIndex(on ? 500 : 10);
    },
  };
}

