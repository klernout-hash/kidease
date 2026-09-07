/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_POSTHOG_KEY?: string;
  readonly VITE_PUBLIC_POSTHOG_HOST?: string;
  /** Inlined at build from Vercel `POSTHOG_HOST` via vite `envPrefix`. */
  readonly POSTHOG_HOST?: string;
  /** Same DSN as server `SENTRY_DSN`, public so the browser SDK can init. */
  readonly VITE_PUBLIC_SENTRY_DSN?: string;
  /** Public r2.dev origin for listing /photos/… paths. Not a secret. */
  readonly VITE_R2_PUBLIC_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
