/**
 * Browser Google Maps JavaScript API loader.
 *
 * Vite only inlines `VITE_*` into the client bundle. `GOOGLE_MAPS_API_KEY` /
 * `GOOGLE_PLACES_API_KEY` stay server-only (Places ratings) and must not be
 * read here — they would be empty in the browser.
 *
 * Set `VITE_GOOGLE_MAPS_API_KEY` on Vercel (same key value as the server
 * Maps/Places key). Maps JavaScript API must stay enabled on the GCP project.
 *
 * Optional `VITE_GOOGLE_MAPS_MAP_ID` (public Cloud Map ID) is only used for
 * Advanced Markers / cloud styling. Search always sets `renderingType: RASTER`.
 * A vector Map ID without Map Tiles API (or Safari + `color-scheme: dark`)
 * paints a gray canvas while pins and controls still work.
 */
export const GOOGLE_MAPS_BROWSER_ENV = "VITE_GOOGLE_MAPS_API_KEY";
export const GOOGLE_MAPS_MAP_ID_ENV = "VITE_GOOGLE_MAPS_MAP_ID";

declare global {
  interface Window {
    gm_authFailure?: () => void;
  }
}

export function googleMapsBrowserKey(): string {
  return String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? "").trim();
}

export function hasGoogleMapsBrowserKey(): boolean {
  return googleMapsBrowserKey().length > 0;
}

export function googleMapsMapId(): string {
  return String(import.meta.env.VITE_GOOGLE_MAPS_MAP_ID ?? "").trim();
}

export function hasGoogleMapsMapId(): boolean {
  return googleMapsMapId().length > 0;
}

const SCRIPT_ID = "kidease-google-maps-js";

/**
 * Quarterly is the stable channel. Weekly (also the default if `v` is omitted)
 * has shipped the vector canvas renderer, which stays blank without a Cloud
 * Map ID / Map Tiles API. Raster fallback therefore stays on quarterly.
 */
export const GOOGLE_MAPS_SCRIPT_VERSION = "quarterly";

let mapsPromise: Promise<typeof google.maps> | null = null;

export function googleMapsScriptSrc(key: string, mapId = googleMapsMapId()): string {
  const base = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=${GOOGLE_MAPS_SCRIPT_VERSION}&loading=async`;
  return mapId ? `${base}&libraries=marker` : base;
}

/** Classic PNG/JPEG tiles. No Map ID required — only Maps JavaScript API + referrers. */
export function googleMapsRasterRenderingType(maps: typeof google.maps): "RASTER" {
  const raster = (maps as typeof maps & { RenderingType?: { RASTER?: "RASTER" } }).RenderingType
    ?.RASTER;
  return raster ?? "RASTER";
}

/** Raster JSON styles. Ignored by the Maps JS API when `mapId` is set. */
export const ROAD_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

/**
 * Cloud Map ID (Advanced Markers) vs JSON styles.
 * Always raster — `renderingType` overrides a vector Map ID in Cloud Console.
 */
export function listingMapRendererExtras(mapId: string):
  | { mapId: string; renderingType: "RASTER" }
  | { styles: typeof ROAD_STYLES; renderingType: "RASTER" } {
  const id = mapId.trim();
  if (id) return { mapId: id, renderingType: "RASTER" };
  return { styles: ROAD_STYLES, renderingType: "RASTER" };
}

export function listingMapConstructorOptions(input: {
  maps: typeof google.maps;
  center: google.maps.LatLngLiteral;
  zoom: number;
  mapTypeId: google.maps.MapTypeId | "roadmap" | "hybrid";
  mapId?: string;
}): google.maps.MapOptions {
  const extras = listingMapRendererExtras(input.mapId ?? googleMapsMapId());
  const shared: google.maps.MapOptions = {
    center: input.center,
    zoom: input.zoom,
    mapTypeId: input.mapTypeId,
    disableDefaultUI: true,
    zoomControl: false,
    mapTypeControl: false,
    streetViewControl: false,
    fullscreenControl: false,
    gestureHandling: "greedy",
    clickableIcons: false,
  };
  const renderingType = googleMapsRasterRenderingType(input.maps);
  if ("mapId" in extras) {
    return { ...shared, mapId: extras.mapId, renderingType };
  }
  return {
    ...shared,
    styles: extras.styles,
    renderingType,
  } as google.maps.MapOptions;
}

/** How long to wait for the first `tilesloaded` before dropping a Map ID. */
export const MAP_TILES_WAIT_MS = 2500;
/**
 * Per-attempt wait for the Maps JS bootstrap.
 * `loading=async` fires script onload before `google.maps.Map` exists, so this
 * budget covers `importLibrary("maps")` as well as the script download.
 */
export const MAP_SCRIPT_WAIT_MS = 12_000;
/** Backoff between automatic loader attempts. Two retries, then the manual Retry button. */
export const MAPS_RETRY_DELAYS_MS = [500, 1_500] as const;
/** Wall-clock cap for the automatic attempts inside one `loadGoogleMaps()` call. */
export const MAPS_LOAD_BUDGET_MS = 24_000;
/**
 * Search-map skeleton stays up through the loader budget so a slow first
 * attempt is not replaced by "Map is taking too long" before auto-retry.
 */
export const MAP_VIEW_WAIT_MS = 28_000;

const MAPS_CALLBACK_NAME = "__kideaseGoogleMapsReady";

/** True only when the Maps constructor is actually callable. */
export function mapsNamespaceReady(maps?: { Map?: unknown } | null): boolean {
  return typeof maps?.Map === "function";
}

/** Delay before retry attempt `attempt` (0-based). Null when retries are exhausted. */
export function nextMapsRetryDelayMs(attempt: number): number | null {
  if (!Number.isInteger(attempt) || attempt < 0 || attempt >= MAPS_RETRY_DELAYS_MS.length) return null;
  return MAPS_RETRY_DELAYS_MS[attempt] ?? null;
}

/** One script tag. A pending tag is waited on; never inject a second copy. */
export function claimMapsScriptSlot(doc: { getElementById(id: string): unknown }): "pending" | "inject" {
  return doc.getElementById(SCRIPT_ID) ? "pending" : "inject";
}

const TILE_HOST_RE = /googleapis\.com|gstatic\.com|ggpht\.com|google\.com\/maps|\/maps\/vt/;

export function mapHostHasRasterTiles(
  root: { querySelectorAll: (selector: string) => ArrayLike<{ src?: string; currentSrc?: string }> } | null | undefined,
): boolean {
  if (!root) return false;
  const imgs = root.querySelectorAll(".gm-style img[src]");
  for (let i = 0; i < imgs.length; i++) {
    const src = String(imgs[i]?.currentSrc || imgs[i]?.src || "");
    if (TILE_HOST_RE.test(src)) return true;
  }
  return false;
}

export function waitForMapTiles(
  map: { addListener: (name: string, handler: () => void) => unknown },
  root: Parameters<typeof mapHostHasRasterTiles>[0],
  maps: { event?: { removeListener?: (listener: never) => void } },
  timeoutMs = MAP_TILES_WAIT_MS,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (mapHostHasRasterTiles(root)) {
      resolve(true);
      return;
    }
    let settled = false;
    function finish(ok: boolean) {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      try {
        maps.event?.removeListener?.(listener as never);
      } catch {
        /* listener already gone */
      }
      resolve(ok);
    }
    const listener = map.addListener("tilesloaded", () => finish(true));
    const timer = globalThis.setTimeout(() => finish(mapHostHasRasterTiles(root)), timeoutMs);
  });
}

export async function createKidEaseMap(
  maps: typeof google.maps,
  el: HTMLElement,
  input: Omit<Parameters<typeof listingMapConstructorOptions>[0], "maps">,
  tileWaitMs = MAP_TILES_WAIT_MS,
): Promise<{ map: google.maps.Map; usedMapId: string; tilesReady: boolean }> {
  const preferredId = String(input.mapId ?? googleMapsMapId()).trim();
  const build = (mapId: string) =>
    new maps.Map(el, listingMapConstructorOptions({ ...input, maps, mapId }));

  let usedMapId = preferredId;
  let map = build(usedMapId);
  let tilesReady = await waitForMapTiles(map, el, maps, tileWaitMs);
  if (!tilesReady && usedMapId) {
    el.innerHTML = "";
    usedMapId = "";
    map = build("");
    tilesReady = await waitForMapTiles(map, el, maps, tileWaitMs);
  }
  return { map, usedMapId, tilesReady };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

/**
 * One attempt. With `loading=async`, script onload runs before `google.maps.Map`
 * exists. Wait for the callback and `importLibrary("maps")` instead of failing
 * the moment the tag loads.
 */
function loadGoogleMapsOnce(key: string, timeoutMs: number): Promise<typeof google.maps> {
  if (mapsNamespaceReady(window.google?.maps)) return Promise.resolve(window.google.maps);
  return new Promise((resolve, reject) => {
    let settled = false;
    let importing = false;
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      window.clearInterval(poll);
      if (err) {
        reject(err);
        return;
      }
      if (mapsNamespaceReady(window.google?.maps)) resolve(window.google.maps);
      else reject(new Error("Google Maps timed out"));
    };
    const tryReady = () => {
      const maps = window.google?.maps;
      if (mapsNamespaceReady(maps)) {
        finish();
        return;
      }
      if (maps && typeof maps.importLibrary === "function" && !importing) {
        importing = true;
        void maps
          .importLibrary("maps")
          .then(() => {
            if (mapsNamespaceReady(window.google?.maps)) finish();
          })
          .catch(() => undefined);
      }
    };
    const timer = window.setTimeout(() => finish(new Error("Google Maps timed out")), timeoutMs);
    const poll = window.setInterval(tryReady, 50);
    window.gm_authFailure = () => {
      finish(new Error("Google Maps key was rejected"));
    };

    const slot = claimMapsScriptSlot(document);
    if (slot === "pending") {
      const prev = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
      prev?.addEventListener(
        "error",
        () => {
          prev.remove();
          finish(new Error("Google Maps failed to load"));
        },
        { once: true },
      );
      tryReady();
      return;
    }

    const host = window as unknown as Record<string, unknown>;
    host[MAPS_CALLBACK_NAME] = () => tryReady();
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.src = `${googleMapsScriptSrc(key)}&callback=${MAPS_CALLBACK_NAME}`;
    script.onerror = () => {
      script.remove();
      finish(new Error("Google Maps failed to load"));
    };
    document.head.appendChild(script);
    tryReady();
  });
}

async function loadGoogleMapsWithRetries(key: string): Promise<typeof google.maps> {
  const started = Date.now();
  const attempts = MAPS_RETRY_DELAYS_MS.length + 1;
  let last: Error = new Error("Google Maps timed out");
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (mapsNamespaceReady(window.google?.maps)) return window.google.maps;
    if (attempt > 0) {
      const wait = nextMapsRetryDelayMs(attempt - 1) ?? 0;
      if (wait > 0) await delay(wait);
    }
    const remaining = MAPS_LOAD_BUDGET_MS - (Date.now() - started);
    if (remaining <= 0) break;
    if (mapsNamespaceReady(window.google?.maps)) return window.google.maps;
    try {
      return await loadGoogleMapsOnce(key, Math.min(MAP_SCRIPT_WAIT_MS, remaining));
    } catch (err) {
      last = err instanceof Error ? err : new Error("Google Maps failed to load");
      if (/rejected/i.test(last.message)) throw last;
    }
  }
  throw last;
}

export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps is browser-only"));
  }
  const key = googleMapsBrowserKey();
  if (!key) {
    return Promise.reject(new Error(`${GOOGLE_MAPS_BROWSER_ENV} is not set`));
  }
  if (mapsNamespaceReady(window.google?.maps)) return Promise.resolve(window.google.maps);
  if (mapsPromise) return mapsPromise;

  mapsPromise = loadGoogleMapsWithRetries(key).then(
    (maps) => maps,
    (err) => {
      mapsPromise = null;
      throw err;
    },
  );
  return mapsPromise;
}

export function googleMapTypeId(base: "roadmap" | "satellite"): google.maps.MapTypeId | "roadmap" | "hybrid" {
  return base === "satellite" ? "hybrid" : "roadmap";
}

export type MarkerCollision = "REQUIRED" | "OPTIONAL_AND_HIDES_LOWER_PRIORITY" | "REQUIRED_AND_HIDES_OPTIONAL";

type HtmlOverlayOpts = {
  position: google.maps.LatLngLiteral;
  content: HTMLElement;
  map: google.maps.Map;
  onClick?: () => void;
  /** Clusters sit on the point; listing pins anchor at the bottom center. */
  centered?: boolean;
  zIndex?: number;
  collision?: MarkerCollision;
};

/** Custom HTML pin/cluster overlay. Avoids Advanced Markers (no Map ID required). */
export function defineHtmlOverlay(maps: typeof google.maps) {
  return class HtmlOverlay extends maps.OverlayView {
    private position: google.maps.LatLngLiteral;
    private content: HTMLElement;
    private wrap: HTMLDivElement | null = null;
    private onClick?: () => void;
    private centered: boolean;
    private clickListener?: () => void;

    constructor(opts: HtmlOverlayOpts) {
      super();
      this.position = opts.position;
      this.content = opts.content;
      this.onClick = opts.onClick;
      this.centered = Boolean(opts.centered);
      if (opts.zIndex != null) this.content.style.zIndex = String(opts.zIndex);
      this.setMap(opts.map);
    }

    onAdd() {
      const wrap = document.createElement("div");
      wrap.style.position = "absolute";
      wrap.style.transform = this.centered ? "translate(-50%, -50%)" : "translate(-50%, -100%)";
      wrap.appendChild(this.content);
      if (this.onClick) {
        wrap.style.cursor = "pointer";
        this.clickListener = () => this.onClick?.();
        wrap.addEventListener("click", (event) => {
          event.stopPropagation();
          this.clickListener?.();
        });
      }
      this.wrap = wrap;
      this.getPanes()?.overlayMouseTarget.appendChild(wrap);
    }

    draw() {
      const projection = this.getProjection();
      const wrap = this.wrap;
      if (!projection || !wrap) return;
      const point = projection.fromLatLngToDivPixel(new maps.LatLng(this.position.lat, this.position.lng));
      if (!point) return;
      wrap.style.left = `${point.x}px`;
      wrap.style.top = `${point.y}px`;
    }

    onRemove() {
      this.wrap?.remove();
      this.wrap = null;
    }

    getElement() {
      return this.content;
    }

    setZIndex(z: number) {
      if (this.wrap) this.wrap.style.zIndex = String(z);
      this.content.style.zIndex = String(z);
    }
  };
}

export type HtmlOverlayInstance = InstanceType<ReturnType<typeof defineHtmlOverlay>>;

export type AdvancedMarkerCtor = typeof google.maps.marker.AdvancedMarkerElement;

/** Advanced Markers need a Map ID. Skip the library unless one is configured. */
export async function loadAdvancedMarkerElement(
  maps: typeof google.maps,
  mapId = googleMapsMapId(),
): Promise<AdvancedMarkerCtor | null> {
  if (!mapId.trim()) return null;
  try {
    if (typeof maps.importLibrary === "function") {
      const lib = await Promise.race([
        maps.importLibrary("marker"),
        new Promise<null>((resolve) => {
          globalThis.setTimeout(() => resolve(null), MAP_SCRIPT_WAIT_MS);
        }),
      ]);
      if (lib?.AdvancedMarkerElement) return lib.AdvancedMarkerElement;
    }
    return maps.marker?.AdvancedMarkerElement ?? null;
  } catch {
    return null;
  }
}

export type ListingOverlay = {
  setMap(map: google.maps.Map | null): void;
  getElement(): HTMLElement;
  setZIndex(z: number): void;
};

export type ListingOverlayOpts = HtmlOverlayOpts;

function createAdvancedListingOverlay(
  AdvancedMarker: AdvancedMarkerCtor,
  opts: ListingOverlayOpts,
): ListingOverlay {
  const content = opts.content;
  const marker = new AdvancedMarker({
    map: opts.map,
    position: opts.position,
    content,
    zIndex: opts.zIndex,
    gmpClickable: Boolean(opts.onClick),
    collisionBehavior: opts.collision ?? "REQUIRED",
    anchorLeft: "-50%",
    // Default Advanced Marker anchor is bottom-center; clusters sit on the point.
    anchorTop: opts.centered ? "-50%" : "-100%",
  });
  if (opts.onClick) {
    let armed = true;
    const handle = () => {
      if (!armed) return;
      armed = false;
      queueMicrotask(() => {
        armed = true;
      });
      opts.onClick?.();
    };
    try {
      marker.addListener("gmp-click", handle);
    } catch {
      /* older marker builds */
    }
    try {
      marker.addListener("click", handle);
    } catch {
      /* click is optional */
    }
    content.addEventListener("click", (event) => {
      event.stopPropagation();
      handle();
    });
  }
  return {
    setMap(map) {
      marker.map = map;
    },
    getElement() {
      return content;
    },
    setZIndex(z) {
      marker.zIndex = z;
      content.style.zIndex = String(z);
    },
  };
}

export function createListingOverlayFactory(
  maps: typeof google.maps,
  AdvancedMarker?: AdvancedMarkerCtor | null,
): (opts: ListingOverlayOpts) => ListingOverlay {
  if (AdvancedMarker) {
    return (opts) => createAdvancedListingOverlay(AdvancedMarker, opts);
  }
  const HtmlOverlay = defineHtmlOverlay(maps);
  return (opts) => new HtmlOverlay(opts);
}

export type MovableDot = {
  setPosition(position: google.maps.LatLngLiteral): void;
  setMap(map: google.maps.Map | null): void;
};

export function createYouAreHereDot(opts: {
  maps: typeof google.maps;
  map: google.maps.Map;
  position: google.maps.LatLngLiteral;
  AdvancedMarker?: AdvancedMarkerCtor | null;
}): MovableDot {
  if (opts.AdvancedMarker) {
    const content = document.createElement("div");
    content.className = "ke-you-dot";
    content.setAttribute("aria-hidden", "true");
    const marker = new opts.AdvancedMarker({
      map: opts.map,
      position: opts.position,
      content,
      zIndex: 2,
      gmpClickable: false,
      collisionBehavior: "REQUIRED",
      anchorLeft: "-50%",
      anchorTop: "-50%",
    });
    return {
      setPosition(position) {
        marker.position = position;
      },
      setMap(map) {
        marker.map = map;
      },
    };
  }
  const marker = new opts.maps.Marker({
    map: opts.map,
    position: opts.position,
    clickable: false,
    zIndex: 2,
    icon: {
      path: opts.maps.SymbolPath.CIRCLE,
      scale: 8,
      fillColor: "#1a3790",
      fillOpacity: 1,
      strokeColor: "#ffffff",
      strokeWeight: 3,
    },
  });
  return {
    setPosition(position) {
      marker.setPosition(position);
    },
    setMap(map) {
      marker.setMap(map);
    },
  };
}
