/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_POSTHOG_KEY?: string;
  readonly VITE_PUBLIC_POSTHOG_HOST?: string;
  /** Session replay kill switch. Unset = on (web). `0` / `false` turns recordings off. */
  readonly VITE_PUBLIC_POSTHOG_REPLAY?: string;
  /** Session replay sample rate, 0–1 or 0–100. Default 0.2. */
  readonly VITE_PUBLIC_POSTHOG_REPLAY_SAMPLE?: string;
  /** Capacitor session replay. Unset / `0` = off. */
  readonly VITE_PUBLIC_POSTHOG_REPLAY_NATIVE?: string;
  /** Inlined at build from Vercel `POSTHOG_HOST` via vite `envPrefix`. */
  readonly POSTHOG_HOST?: string;
  /** Same DSN as server `SENTRY_DSN`, public so the browser SDK can init. */
  readonly VITE_PUBLIC_SENTRY_DSN?: string;
  /** Public media origin for listing /photos/… paths (media.kidease.ca). Not a secret. */
  readonly VITE_R2_PUBLIC_BASE_URL?: string;
  /** Opt-in Cloudflare Image Transformations on media.kidease.ca. Default off. */
  readonly VITE_CF_IMAGE_RESIZE?: string;
  /** Store-specific web build. Blank on www.kidease.ca. Not a secret. */
  readonly VITE_STORE_CHANNEL?: string;
  /** Public Amazon Appstore listing. Empty hides the Get it button. Not a secret. */
  readonly NEXT_PUBLIC_AMAZON_APPSTORE_URL?: string;
  /** Map basemap. `google` (default) or `openfreemap`. Not a secret. */
  readonly VITE_MAP_PROVIDER?: string;
  /** Alias of VITE_MAP_PROVIDER. Not a secret. */
  readonly NEXT_PUBLIC_MAP_PROVIDER?: string;
  /** Inlined only when the map provider is google. Never commit a real value. */
  readonly VITE_GOOGLE_MAPS_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
