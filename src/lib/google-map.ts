/**
 * Google Maps JavaScript API for search, listing, and area maps.
 *
 * Cost controls:
 * - The script is injected once, and only after a map host is on screen.
 * - Core maps library only. One Dynamic Map load per visible map.
 * - Pins use lat/lng already stored on the listing. No client geocoding.
 * - Places API (New) is not called. No new Place class, text search,
 *   autocomplete, or place photos. POI clicks stay off so a pin tap
 *   cannot open a Places bill.
 * - Street View controls and panorama requests stay off.
 * - `gm_authFailure` or a script error rejects so the caller can use OpenFreeMap.
 */
import { readClientStoreChannel } from "./native-entitlements.ts";
import { browserGoogleMapsKey, forceMapProvider } from "./map-provider.ts";

const SCRIPT_WAIT_MS = 8_000;
const AUTH_GRACE_MS = 500;
const MARK = Symbol.for("kidease.google-map");

type GLatLng = { lat(): number; lng(): number };
type GPoint = { x: number; y: number };
type GListener = { remove(): void };

type GMap = {
  setCenter(position: { lat: number; lng: number }): void;
  getCenter(): GLatLng | undefined;
  getZoom(): number | undefined;
  setZoom(zoom: number): void;
  panTo(position: { lat: number; lng: number }): void;
  fitBounds(bounds: unknown, padding?: number | { top: number; right: number; bottom: number; left: number }): void;
  getBounds(): { getNorthEast(): GLatLng; getSouthWest(): GLatLng } | undefined;
  getDiv(): HTMLElement;
  setMapTypeId(id: string): void;
  addListener(name: string, fn: () => void): GListener;
};

type GOverlay = {
  onAdd(): void;
  draw(): void;
  onRemove(): void;
  setMap(map: GMap | null): void;
  getPanes(): { overlayMouseTarget?: HTMLElement } | null | undefined;
  getProjection(): {
    fromLatLngToDivPixel(point: GLatLng): GPoint | null | undefined;
    fromLatLngToContainerPixel(point: GLatLng): GPoint | null | undefined;
  } | null | undefined;
};

export type GoogleNamespace = {
  Map: new (el: HTMLElement, opts: Record<string, unknown>) => GMap;
  LatLng: new (lat: number, lng: number) => GLatLng;
  LatLngBounds: new (sw?: { lat: number; lng: number }, ne?: { lat: number; lng: number }) => {
    extend(point: { lat: number; lng: number }): void;
    isEmpty(): boolean;
  };
  Circle: new (opts: Record<string, unknown>) => {
    setCenter(center: { lat: number; lng: number }): void;
    setRadius(radius: number): void;
    setOptions(style: Record<string, unknown>): void;
    setMap(map: GMap | null): void;
    getBounds(): { isEmpty(): boolean } | null | undefined;
  };
  OverlayView: new () => GOverlay;
  event: {
    addListener(target: unknown, name: string, fn: () => void): GListener;
    addListenerOnce(target: unknown, name: string, fn: () => void): GListener;
    removeListener(listener?: GListener | null): void;
    trigger(target: unknown, name: string): void;
    clearInstanceListeners(target: unknown): void;
  };
  importLibrary?: (name: string) => Promise<unknown>;
};

type GoogleLiveMap = GMap & {
  destroy(): void;
  resize(): void;
};

declare global {
  interface Window {
    gm_authFailure?: () => void;
    __kideaseGoogleMapsLoaded?: () => void;
    google?: { maps?: GoogleNamespace };
  }
}

export type GoogleMapInput = {
  center: { lat: number; lng: number };
  zoom: number;
  mapTypeId: "roadmap" | "hybrid" | "satellite";
  cooperative?: boolean;
  tileWaitMs?: number;
  signal?: AbortSignal;
  /** Fired if Google rejects the key after the map was shown. Provider is already OpenFreeMap. */
  onAuthFailure?: () => void;
};

let scriptTask: Promise<void> | null = null;
let authFailed = false;
let authHooked = false;
let generation = 0;
let live: { destroy(): void } | null = null;

export function googleMapsAuthFailed() {
  return authFailed;
}

function authError() {
  const err = new Error("gm_authFailure");
  err.name = "GmAuthFailure";
  return err;
}

function supersededError() {
  const err = new Error("Map superseded");
  err.name = "MapSupersededError";
  return err;
}

function abortError() {
  const err = new Error("Map closed");
  err.name = "AbortError";
  return err;
}

function unavailableError() {
  const err = new Error("Map is not available on this device");
  err.name = "MapUnavailableError";
  return err;
}

function installAuthHook() {
  if (authHooked || typeof window === "undefined") return;
  authHooked = true;
  const previous = window.gm_authFailure;
  window.gm_authFailure = () => {
    authFailed = true;
    window.dispatchEvent(new Event("ke-gm-auth-failure"));
    if (typeof previous === "function") previous();
  };
}

/**
 * One Maps JS request per page.
 * The URL is the core map script only. It does not name a Places or Street View library.
 */
export function preloadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Map is browser-only"));
  if (readClientStoreChannel() === "huawei") return Promise.reject(unavailableError());
  if (authFailed) return Promise.reject(authError());
  const key = browserGoogleMapsKey();
  if (!key) return Promise.reject(new Error("Google Maps key missing"));
  if (window.google?.maps?.Map) return Promise.resolve();
  if (!scriptTask) {
    scriptTask = injectGoogleScript(key).catch((err) => {
      scriptTask = null;
      throw err;
    });
  }
  return scriptTask;
}

function injectGoogleScript(key: string): Promise<void> {
  installAuthHook();
  return new Promise<void>((resolve, reject) => {
    const callback = "__kideaseGoogleMapsLoaded";
    const params = new URLSearchParams({
      key,
      v: "weekly",
      loading: "async",
      callback,
    });
    const script = document.createElement("script");
    script.async = true;
    script.dataset.keGoogleMaps = "1";
    const nonce = document.querySelector("script[nonce]")?.getAttribute("nonce");
    if (nonce) {
      script.nonce = nonce;
      script.setAttribute("nonce", nonce);
    }
    let settled = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      if (err) reject(err);
      else resolve();
    };
    const timer = window.setTimeout(() => finish(new Error("Google Maps script timed out")), SCRIPT_WAIT_MS);
    window.__kideaseGoogleMapsLoaded = () => {
      finish(authFailed ? authError() : undefined);
    };
    script.onerror = () => finish(new Error("Google Maps script failed"));
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
    document.head.appendChild(script);
  }).then(async () => {
    if (authFailed) throw authError();
    const maps = window.google?.maps;
    if (maps?.Map) return;
    if (typeof maps?.importLibrary === "function") await maps.importLibrary("maps");
    if (!window.google?.maps?.Map) throw new Error("Google Maps script failed");
  });
}

function releaseLiveMap() {
  const previous = live;
  live = null;
  previous?.destroy();
}

export function isGoogleMap(value: unknown): value is GoogleLiveMap {
  return Boolean(value && typeof value === "object" && MARK in (value as object));
}

export async function createGoogleKidEaseMap(el: HTMLElement, input: GoogleMapInput) {
  const token = ++generation;
  await preloadGoogleMaps();
  if (input.signal?.aborted) throw abortError();
  if (token !== generation) throw supersededError();
  const maps = window.google?.maps;
  if (!maps?.Map) throw new Error("Google Maps script failed");
  releaseLiveMap();
  if (token !== generation) throw supersededError();
  const satellite = input.mapTypeId === "hybrid" || input.mapTypeId === "satellite";
  const raw = new maps.Map(el, {
    center: { lat: input.center.lat, lng: input.center.lng },
    zoom: input.zoom,
    mapTypeId: satellite ? "hybrid" : "roadmap",
    disableDefaultUI: true,
    clickableIcons: false,
    streetViewControl: false,
    gestureHandling: input.cooperative ? "cooperative" : "greedy",
    keyboardShortcuts: true,
    minZoom: 3,
    maxZoom: 18,
    backgroundColor: "#F7F4EF",
  });
  const map = raw as GoogleLiveMap;
  let dead = false;
  let onLate: (() => void) | null = null;
  const destroy = () => {
    if (dead) return;
    dead = true;
    if (onLate) window.removeEventListener("ke-gm-auth-failure", onLate);
    if (live?.destroy === destroy) live = null;
    try {
      maps.event.clearInstanceListeners(map);
    } catch {
      /* Map already detached. */
    }
    const host = map.getDiv?.();
    if (host) host.replaceChildren();
  };
  map.destroy = destroy;
  map.resize = () => {
    if (!dead) maps.event.trigger(map, "resize");
  };
  Object.defineProperty(map, MARK, { value: true });
  live = { destroy };
  onLate = () => {
    forceMapProvider("openfreemap");
    destroy();
    input.onAuthFailure?.();
  };
  try {
    const ready = await waitForIdle(map, maps, input.tileWaitMs ?? 12_000, input.signal);
    if (token !== generation) {
      destroy();
      throw supersededError();
    }
    if (!ready) {
      destroy();
      throw new Error("Map timed out");
    }
    window.addEventListener("ke-gm-auth-failure", onLate);
    el.dataset.keMapProvider = "google";
    return {
      map,
      maps: {
        event: maps.event,
        LatLng: maps.LatLng,
        LatLngBounds: maps.LatLngBounds,
        Circle: maps.Circle,
        OverlayView: maps.OverlayView,
      },
      tilesReady: true,
    };
  } catch (err) {
    destroy();
    throw err;
  }
}

function waitForIdle(map: GMap, maps: GoogleNamespace, waitMs: number, signal?: AbortSignal): Promise<boolean> {
  if (authFailed) return Promise.reject(authError());
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    let idle = false;
    let grace = 0;
    let settled = false;
    const listener = maps.event.addListenerOnce(map, "idle", () => {
      idle = true;
      grace = window.setTimeout(() => finish(true), AUTH_GRACE_MS);
    });
    const timer = window.setTimeout(() => finish(idle), waitMs);
    const onAuth = () => fail(authError());
    const onAbort = () => fail(abortError());
    window.addEventListener("ke-gm-auth-failure", onAuth);
    signal?.addEventListener("abort", onAbort);
    function cleanup() {
      window.clearTimeout(timer);
      window.clearTimeout(grace);
      window.removeEventListener("ke-gm-auth-failure", onAuth);
      signal?.removeEventListener("abort", onAbort);
      listener.remove();
    }
    function finish(ok: boolean) {
      if (settled) return;
      settled = true;
      cleanup();
      if (authFailed) reject(authError());
      else resolve(ok);
    }
    function fail(err: Error) {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err);
    }
  });
}

type HtmlMarker = {
  setMap(map: unknown): void;
  getElement(): HTMLElement;
  setZIndex(z: number): void;
  setPosition(position: { lat: number; lng: number }): void;
};

function htmlOverlay(
  map: GMap,
  content: HTMLElement,
  position: { lat: number; lng: number },
  centered: boolean,
): HtmlMarker & { overlay: GOverlay } {
  const maps = window.google?.maps;
  if (!maps?.OverlayView || !maps.LatLng) throw new Error("Google Maps script failed");
  content.style.position = "absolute";
  content.style.transform = centered ? "translate(-50%, -50%)" : "translate(-50%, -100%)";
  const Base = maps.OverlayView as unknown as new () => GOverlay;
  const overlay = new Base();
  let current = position;
  let attached: GMap | null = map;
  overlay.onAdd = () => {
    overlay.getPanes()?.overlayMouseTarget?.appendChild(content);
  };
  overlay.draw = () => {
    const point = overlay.getProjection()?.fromLatLngToDivPixel(new maps.LatLng(current.lat, current.lng));
    if (!point) return;
    content.style.left = `${point.x}px`;
    content.style.top = `${point.y}px`;
  };
  overlay.onRemove = () => {
    content.remove();
  };
  overlay.setMap(map);
  return {
    overlay,
    setMap(next) {
      attached = next && isGoogleMap(next) ? next : null;
      overlay.setMap(attached);
    },
    getElement() {
      return content;
    },
    setZIndex(z) {
      content.style.zIndex = String(z);
    },
    setPosition(next) {
      current = next;
      overlay.draw();
    },
  };
}

export function mountGoogleHtmlMarker(opts: {
  map: GMap;
  position: { lat: number; lng: number };
  content: HTMLElement;
  centered?: boolean;
  onClick?: () => void;
  zIndex?: number;
}): HtmlMarker {
  if (opts.zIndex != null) opts.content.style.zIndex = String(opts.zIndex);
  if (opts.onClick) {
    opts.content.addEventListener("click", (event) => {
      event.stopPropagation();
      opts.onClick?.();
    });
  }
  return htmlOverlay(opts.map, opts.content, opts.position, Boolean(opts.centered));
}

export function mountGoogleYouAreHere(opts: { map: GMap; position: { lat: number; lng: number } }): {
  setPosition(position: { lat: number; lng: number }): void;
  setMap(map: unknown): void;
} {
  const content = document.createElement("div");
  content.className = "ke-you-dot";
  content.style.pointerEvents = "none";
  content.setAttribute("aria-hidden", "true");
  return htmlOverlay(opts.map, content, opts.position, true);
}
