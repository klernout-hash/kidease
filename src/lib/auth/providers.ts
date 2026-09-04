/**
 * The upstream identity providers this app offers for sign-in.
 *
 * Source of truth for BOTH the server (`server.ts`) and the client
 * (`client.ts` / sign-in buttons). Kept in its own dependency-free module so
 * the client can import it without pulling the server-only Better Auth
 * instance (and `pg`) into the browser bundle.
 *
 * Native paths:
 *   - Google: `google` when GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET are set.
 *     Callback `/api/auth/callback/google`.
 *   - Facebook: `facebook` when FACEBOOK_CLIENT_ID + FACEBOOK_CLIENT_SECRET are set.
 *     Callback `/api/auth/callback/facebook`.
 *   - Apple: `apple` when Apple IDP env is set.
 *
 * Broker paths (Google only now — X was replaced by Facebook):
 *   - `grok-google` when GROK_AUTH_CLIENT_* are set.
 */
export type GrokProvider = {
  providerId: string;
  idp: string;
  label: string;
  native?: boolean;
};

export const NATIVE_GOOGLE: GrokProvider = {
  providerId: "google",
  idp: "google",
  label: "Google",
  native: true,
};

export const NATIVE_FACEBOOK: GrokProvider = {
  providerId: "facebook",
  idp: "facebook",
  label: "Facebook",
  native: true,
};

export const GROK_PROVIDERS: readonly GrokProvider[] = [
  { providerId: "apple", idp: "apple", label: "Apple", native: true },
  { providerId: "grok-google", idp: "google", label: "Google" },
];

export const BROKER_PROVIDERS = GROK_PROVIDERS.filter((p) => !p.native);

export function isNativeSocialProvider(providerId: string): boolean {
  return providerId === "apple" || providerId === "google" || providerId === "facebook";
}

export function visibleSignInProviders(opts: {
  nativeGoogle: boolean;
  broker: boolean;
  preferNativeGoogle?: boolean;
  nativeFacebook?: boolean;
}): GrokProvider[] {
  const apple = GROK_PROVIDERS.find((p) => p.providerId === "apple");
  const brokerGoogle = GROK_PROVIDERS.find((p) => p.providerId === "grok-google");
  const out: GrokProvider[] = [];
  if (apple) out.push(apple);

  const google = pickGoogle(opts, brokerGoogle);
  if (google) out.push(google);
  if (opts.nativeFacebook) out.push(NATIVE_FACEBOOK);
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
