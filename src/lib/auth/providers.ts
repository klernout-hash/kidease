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
 * Two X paths can coexist (Better Auth social id is still `twitter`):
 *   - Native: `twitter` via Better Auth `socialProviders.twitter` when
 *     `TWITTER_CLIENT_ID` + `TWITTER_CLIENT_SECRET` are set. Callback is
 *     `/api/auth/callback/twitter`.
 *   - Broker: `grok-x` via `genericOAuth` when the broker is on.
 *     Callback is `/api/auth/oauth2/callback/grok-x`.
 *
 * The login page shows one Google button when either Google path is configured
 * and one X button when either X path is configured (`visibleSignInProviders`).
 * When both paths for a provider are on, the server prefers native on Vercel
 * (GCP / X developer-portal callbacks) and the broker on Grok live preview.
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
  /** Native IDP (Apple / Google / Twitter) — not federated through the Grok broker. */
  native?: boolean;
};

export const NATIVE_GOOGLE: GrokProvider = {
  providerId: "google",
  idp: "google",
  label: "Google",
  native: true,
};

export const NATIVE_TWITTER: GrokProvider = {
  providerId: "twitter",
  idp: "twitter",
  label: "X",
  native: true,
};

export const GROK_PROVIDERS: readonly GrokProvider[] = [
  { providerId: "apple", idp: "apple", label: "Apple", native: true },
  { providerId: "grok-google", idp: "google", label: "Google" },
  { providerId: "grok-x", idp: "twitter", label: "X" },
];

/** Broker-only upstreams (Google + X). Apple / native Google / native X use their own IDP. */
export const BROKER_PROVIDERS = GROK_PROVIDERS.filter((p) => !p.native);

export function isNativeSocialProvider(providerId: string): boolean {
  return providerId === "apple" || providerId === "google" || providerId === "twitter";
}

/**
 * Buttons to render. One Google entry when native and/or broker Google is on.
 * One X entry when native and/or broker X is on. Apple stays in the list
 * (existing leftover — this module does not newly enable Apple).
 */
export function visibleSignInProviders(opts: {
  nativeGoogle: boolean;
  broker: boolean;
  /** When both Google paths are on: native on Vercel, broker on Grok preview. */
  preferNativeGoogle?: boolean;
  nativeTwitter?: boolean;
  /** When both X paths are on: native on Vercel, broker on Grok preview. */
  preferNativeTwitter?: boolean;
}): GrokProvider[] {
  const apple = GROK_PROVIDERS.find((p) => p.providerId === "apple");
  const brokerGoogle = GROK_PROVIDERS.find((p) => p.providerId === "grok-google");
  const brokerX = GROK_PROVIDERS.find((p) => p.providerId === "grok-x");
  const out: GrokProvider[] = [];
  if (apple) out.push(apple);

  const google = pickGoogle(opts, brokerGoogle);
  if (google) out.push(google);
  const x = pickX(opts, brokerX);
  if (x) out.push(x);
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

function pickX(
  opts: { nativeTwitter?: boolean; broker: boolean; preferNativeTwitter?: boolean },
  brokerX: GrokProvider | undefined,
): GrokProvider | null {
  const nativeTwitter = Boolean(opts.nativeTwitter);
  if (!nativeTwitter && !opts.broker) return null;
  if (nativeTwitter && opts.broker) {
    return opts.preferNativeTwitter ? NATIVE_TWITTER : (brokerX ?? NATIVE_TWITTER);
  }
  if (nativeTwitter) return NATIVE_TWITTER;
  return brokerX ?? null;
}
