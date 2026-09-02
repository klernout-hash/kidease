/**
 * The upstream identity providers this app offers for sign-in.
 *
 * Source of truth for BOTH the server (`server.ts`) and the client
 * (`client.ts` / sign-in buttons). Kept in its own dependency-free module so
 * the client can import it without pulling the server-only Better Auth
 * instance (and `pg`) into the browser bundle.
 *
 * Two Google paths can coexist (different provider ids):
 *   - Native: `google` via Better Auth `socialProviders.google` when
 *     `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` are set. Callback is
 *     `/api/auth/callback/google`.
 *   - Broker: `grok-google` via `genericOAuth` when `GROK_AUTH_CLIENT_ID` +
 *     `GROK_AUTH_CLIENT_SECRET` are set (or the sandbox preview client).
 *     Callback is `/api/auth/oauth2/callback/grok-google`.
 *
 * The login page shows one Google button when either path is configured
 * (`visibleSignInProviders`). When both are on, the server prefers native
 * Google on Vercel (GCP callbacks) and the broker on Grok live preview.
 *
 * `idp` is the hint the broker reads to pick the upstream (Better Auth's id
 * for X is still `twitter`).
 */
export type GrokProvider = {
  /** This app's local provider id; also the callback path segment. */
  providerId: string;
  /** Upstream hint the broker forwards to (Better Auth social id). */
  idp: string;
  /** Human label for the sign-in button. */
  label: string;
  /** Native IDP (Apple / Google) — not federated through the Grok broker. */
  native?: boolean;
};

export const NATIVE_GOOGLE: GrokProvider = {
  providerId: "google",
  idp: "google",
  label: "Google",
  native: true,
};

export const GROK_PROVIDERS: readonly GrokProvider[] = [
  { providerId: "apple", idp: "apple", label: "Apple", native: true },
  { providerId: "grok-google", idp: "google", label: "Google" },
  { providerId: "grok-x", idp: "twitter", label: "X" },
];

/** Broker-only upstreams (Google + X). Apple / native Google use their own IDP. */
export const BROKER_PROVIDERS = GROK_PROVIDERS.filter((p) => !p.native);

export function isNativeSocialProvider(providerId: string): boolean {
  return providerId === "apple" || providerId === "google";
}

/**
 * Buttons to render. One Google entry when native and/or broker Google is on.
 * Apple stays in the list (existing). X stays a broker leftover.
 */
export function visibleSignInProviders(opts: {
  nativeGoogle: boolean;
  broker: boolean;
  /** When both Google paths are on: native on Vercel, broker on Grok preview. */
  preferNativeGoogle?: boolean;
}): GrokProvider[] {
  const apple = GROK_PROVIDERS.find((p) => p.providerId === "apple");
  const brokerGoogle = GROK_PROVIDERS.find((p) => p.providerId === "grok-google");
  const x = GROK_PROVIDERS.find((p) => p.providerId === "grok-x");
  const out: GrokProvider[] = [];
  if (apple) out.push(apple);

  const google = pickGoogle(opts, brokerGoogle);
  if (google) out.push(google);
  if (opts.broker && x) out.push(x);
  return out;
}

function pickGoogle(
  opts: { nativeGoogle: boolean; broker: boolean; preferNativeGoogle?: boolean },
  brokerGoogle: GrokProvider | undefined,
): GrokProvider | null {
  if (!opts.nativeGoogle && !opts.broker) return null;
  if (opts.nativeGoogle && opts.broker) {
    return opts.preferNativeGoogle ? NATIVE_GOOGLE : (brokerGoogle ?? NATIVE_GOOGLE);
  }
  if (opts.nativeGoogle) return NATIVE_GOOGLE;
  return brokerGoogle ?? null;
}
