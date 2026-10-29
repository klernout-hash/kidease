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

export const NATIVE_APPLE: GrokProvider = {
  providerId: "apple",
  idp: "apple",
  label: "Apple",
  native: true,
};

export const GROK_PROVIDERS: readonly GrokProvider[] = [
  NATIVE_APPLE,
  { providerId: "grok-google", idp: "google", label: "Google" },
];

export const BROKER_PROVIDERS = GROK_PROVIDERS.filter((p) => !p.native);

export function isNativeSocialProvider(providerId: string): boolean {
  return providerId === "apple" || providerId === "google" || providerId === "facebook";
}

/** Apple, then Google, then Facebook. Same order on web, iOS, and Android. */
export const SOCIAL_SIGN_IN_ORDER = ["apple", "google", "facebook"] as const;

export function socialSignInRank(idp: string): number {
  const index = SOCIAL_SIGN_IN_ORDER.indexOf(idp as (typeof SOCIAL_SIGN_IN_ORDER)[number]);
  return index === -1 ? SOCIAL_SIGN_IN_ORDER.length : index;
}

export function orderSocialSignIn<T extends { idp: string }>(providers: readonly T[]): T[] {
  return [...providers].sort((a, b) => socialSignInRank(a.idp) - socialSignInRank(b.idp));
}

/** Huawei has no Google Play Services, so the Google button stays off that build. */
export function providersForStore<T extends { idp: string }>(providers: readonly T[], channel: string): T[] {
  const next = channel === "huawei" ? providers.filter((provider) => provider.idp !== "google") : [...providers];
  return orderSocialSignIn(next);
}

export function visibleSignInProviders(opts: {
  nativeGoogle: boolean;
  broker: boolean;
  preferNativeGoogle?: boolean;
  nativeFacebook?: boolean;
  nativeApple?: boolean;
}): GrokProvider[] {
  const brokerGoogle = GROK_PROVIDERS.find((p) => p.providerId === "grok-google");
  const out: GrokProvider[] = [];
  // Hide Apple unless APPLE_* is set — a visible button with no socialProviders.apple
  // disables, then re-enables, with no picker and no error.
  if (opts.nativeApple) out.push(NATIVE_APPLE);

  const google = pickGoogle(opts, brokerGoogle);
  if (google) out.push(google);
  if (opts.nativeFacebook) out.push(NATIVE_FACEBOOK);
  return orderSocialSignIn(out);
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
