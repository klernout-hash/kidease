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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
