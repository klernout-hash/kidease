/**
 * Browser Google Maps JavaScript API loader.
 *
 * Vite only inlines `VITE_*` into the client bundle. `GOOGLE_MAPS_API_KEY` /
 * `GOOGLE_PLACES_API_KEY` stay server-only (Places ratings) and must not be
 * read here — they would be empty in the browser.
 *
 * Set `VITE_GOOGLE_MAPS_API_KEY` on Vercel (same key value as the server
 * Maps/Places key). Maps JavaScript API must stay enabled on the GCP project.
 */
export const GOOGLE_MAPS_BROWSER_ENV = "VITE_GOOGLE_MAPS_API_KEY";

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

const SCRIPT_ID = "kidease-google-maps-js";

/**
 * Quarterly is the stable raster-friendly channel. The weekly channel (also the
 * default if `v` is omitted) has been shipping the vector canvas renderer,
 * which stays blank without a Cloud Map ID / Map Tiles API.
 */
export const GOOGLE_MAPS_SCRIPT_VERSION = "quarterly";

let mapsPromise: Promise<typeof google.maps> | null = null;

export function googleMapsScriptSrc(key: string): string {
  return `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=${GOOGLE_MAPS_SCRIPT_VERSION}`;
}

/** Classic PNG/JPEG tiles. No Map ID required — only Maps JavaScript API + referrers. */
export function googleMapsRasterRenderingType(maps: typeof google.maps): "RASTER" {
  const raster = (maps as typeof maps & { RenderingType?: { RASTER?: "RASTER" } }).RenderingType
    ?.RASTER;
  return raster ?? "RASTER";
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
