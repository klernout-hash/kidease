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

export const NATIVE_HUAWEI: GrokProvider = {
  providerId: "huawei",
  idp: "huawei",
  label: "Huawei ID",
  native: true,
};

export const NATIVE_AMAZON: GrokProvider = {
  providerId: "amazon",
  idp: "amazon",
  label: "Amazon",
  native: true,
};

export const GROK_PROVIDERS: readonly GrokProvider[] = [
  NATIVE_APPLE,
  { providerId: "grok-google", idp: "google", label: "Google" },
];

export const BROKER_PROVIDERS = GROK_PROVIDERS.filter((p) => !p.native);

export function isNativeSocialProvider(providerId: string): boolean {
  return (
    providerId === "apple" ||
    providerId === "google" ||
    providerId === "facebook" ||
    providerId === "huawei" ||
    providerId === "amazon"
  );
}

/** Apple, then Google, then Facebook. Huawei ID and Login with Amazon follow. */
export const SOCIAL_SIGN_IN_ORDER = ["apple", "google", "facebook"] as const;

const EXTRA_SIGN_IN_ORDER = ["huawei", "amazon"] as const;

export type SignInChoice = "apple" | "google" | "facebook" | "huawei" | "amazon" | "email";

/**
 * Buttons that can work on that device. Email is always last.
 * Flags and missing keys still hide a button. This list is the ceiling.
 */
const SIGN_IN_MATRIX: Record<string, readonly SignInChoice[]> = {
  ios: ["apple", "google", "facebook", "email"],
  apple: ["apple", "google", "facebook", "email"],
  play: ["google", "facebook", "email"],
  google: ["google", "facebook", "email"],
  samsung: ["google", "facebook", "email"],
  huawei: ["huawei", "facebook", "email"],
  amazon: ["amazon", "facebook", "email"],
  microsoft: ["apple", "google", "facebook", "email"],
  web: ["apple", "google", "facebook", "email"],
};

export function socialSignInRank(idp: string): number {
  const index = SOCIAL_SIGN_IN_ORDER.indexOf(idp as (typeof SOCIAL_SIGN_IN_ORDER)[number]);
  if (index !== -1) return index;
  const extra = EXTRA_SIGN_IN_ORDER.indexOf(idp as (typeof EXTRA_SIGN_IN_ORDER)[number]);
  if (extra !== -1) return SOCIAL_SIGN_IN_ORDER.length + extra;
  return SOCIAL_SIGN_IN_ORDER.length + EXTRA_SIGN_IN_ORDER.length;
}

/**
 * Sign-in choices for one store, in order.
 * `playServices: false` hides Google even on a Play or Galaxy Store build.
 */
export function signInChoicesForChannel(
  channel: string,
  options?: { playServices?: boolean },
): SignInChoice[] {
  const key = String(channel || "web").trim().toLowerCase();
  const row = SIGN_IN_MATRIX[key] ?? SIGN_IN_MATRIX.web;
  if (options?.playServices === false) return row.filter((id) => id !== "google");
  return [...row];
}

export function orderSocialSignIn<T extends { idp: string }>(providers: readonly T[]): T[] {
  return [...providers].sort((a, b) => socialSignInRank(a.idp) - socialSignInRank(b.idp));
}

/** Keep only the providers that work on this store, in Apple / Google / Facebook / other order. */
export function providersForStore<T extends { idp: string }>(
  providers: readonly T[],
  channel: string,
  options?: { playServices?: boolean },
): T[] {
  const allowed = new Set<string>(
    signInChoicesForChannel(channel, options).filter((id) => id !== "email"),
  );
  return orderSocialSignIn(providers.filter((provider) => allowed.has(provider.idp)));
}

export function visibleSignInProviders(opts: {
  nativeGoogle: boolean;
  broker: boolean;
  preferNativeGoogle?: boolean;
  nativeFacebook?: boolean;
  nativeApple?: boolean;
  nativeHuawei?: boolean;
  nativeAmazon?: boolean;
}): GrokProvider[] {
  const brokerGoogle = GROK_PROVIDERS.find((p) => p.providerId === "grok-google");
  const out: GrokProvider[] = [];
  // Hide Apple unless APPLE_* is set — a visible button with no socialProviders.apple
  // disables, then re-enables, with no picker and no error.
  if (opts.nativeApple) out.push(NATIVE_APPLE);

  const google = pickGoogle(opts, brokerGoogle);
  if (google) out.push(google);
  if (opts.nativeFacebook) out.push(NATIVE_FACEBOOK);
  if (opts.nativeHuawei) out.push(NATIVE_HUAWEI);
  if (opts.nativeAmazon) out.push(NATIVE_AMAZON);
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
