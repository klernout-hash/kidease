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
 * Optional `VITE_GOOGLE_MAPS_MAP_ID` (public Cloud Map ID) turns on vector
 * tiles, cloud styling, and Advanced Markers. Leave it empty to keep the
 * classic raster path — weekly/vector without a Map ID paints a gray canvas.
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
  const base = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=${GOOGLE_MAPS_SCRIPT_VERSION}`;
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
 * Vector (Cloud Map ID) vs raster extras for `new maps.Map`.
 * Empty / whitespace Map ID keeps raster so Search never ships a gray canvas.
 */
export function listingMapRendererExtras(mapId: string):
  | { mapId: string }
  | { styles: typeof ROAD_STYLES; renderingType: "RASTER" } {
  const id = mapId.trim();
  if (id) return { mapId: id };
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
    zoomControl: true,
    zoomControlOptions: { position: input.maps.ControlPosition.RIGHT_BOTTOM },
    gestureHandling: "greedy",
    clickableIcons: false,
  };
  if ("mapId" in extras) {
    return { ...shared, mapId: extras.mapId };
  }
  return {
    ...shared,
    styles: extras.styles,
    // Raster only when no Map ID — vector without mapId is a gray canvas.
    renderingType: googleMapsRasterRenderingType(input.maps),
  } as google.maps.MapOptions;
}

export function loadGoogleMaps(): Promise<typeof google.maps> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps is browser-only"));
  }
  const key = googleMapsBrowserKey();
  if (!key) {
    return Promise.reject(new Error(`${GOOGLE_MAPS_BROWSER_ENV} is not set`));
  }
  const existing = window.google?.maps;
  if (existing?.Map) return Promise.resolve(existing);

  if (mapsPromise) return mapsPromise;

  mapsPromise = new Promise((resolve, reject) => {
    const fail = (message: string) => {
      mapsPromise = null;
      reject(new Error(message));
    };
    window.gm_authFailure = () => {
      fail("Google Maps key was rejected");
    };

    const finish = () => {
      const maps = window.google?.maps;
      if (maps?.Map) {
        resolve(maps);
        return;
      }
      fail("Google Maps script loaded without google.maps");
    };

    const prev = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (prev) {
      if (window.google?.maps?.Map) {
        finish();
        return;
      }
      prev.addEventListener("load", finish, { once: true });
      prev.addEventListener(
        "error",
        () => {
          fail("Google Maps failed to load");
        },
        { once: true },
      );
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = googleMapsScriptSrc(key);
    script.onload = finish;
    script.onerror = () => {
      fail("Google Maps failed to load");
    };
    document.head.appendChild(script);
  });

  return mapsPromise;
}

export function googleMapTypeId(base: "roadmap" | "satellite"): google.maps.MapTypeId | "roadmap" | "hybrid" {
  return base === "satellite" ? "hybrid" : "roadmap";
}

type HtmlOverlayOpts = {
  position: google.maps.LatLngLiteral;
  content: HTMLElement;
  map: google.maps.Map;
  onClick?: () => void;
  /** Clusters sit on the point; listing pins anchor at the bottom center. */
  centered?: boolean;
  zIndex?: number;
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
      const lib = await maps.importLibrary("marker");
      if (lib.AdvancedMarkerElement) return lib.AdvancedMarkerElement;
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
    collisionBehavior: "REQUIRED",
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
