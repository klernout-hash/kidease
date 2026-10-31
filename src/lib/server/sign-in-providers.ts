import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { appleLoginVisible } from "@/lib/auth/apple-login-flag";
import { facebookLoginVisible, facebookOauthHost } from "@/lib/auth/facebook-idp";
import { amazonSignInVisible, huaweiSignInVisible } from "@/lib/auth/store-signin-flags";
import { nativeShellHidesAdmin } from "@/lib/native-admin";
import { googlePlayServicesAvailable, storeChannelFromSignals } from "@/lib/native-entitlements";
import { nativeSocialPlatform, signInProvidersForDevice } from "@/lib/auth/native-oauth";
import { visibleSignInProviders, type GrokProvider } from "@/lib/auth/providers";

/**
 * Sign-in buttons the login page should render.
 * Google when native Google or the Grok broker is configured.
 * Facebook only when FACEBOOK_CLIENT_* are set AND FEATURE_FACEBOOK_LOGIN is on
 * (Meta App must be Live — hide a parked "App not active" button).
 * Apple only when APPLE_CLIENT_ID + APPLE_TEAM_ID + APPLE_KEY_ID +
 * APPLE_PRIVATE_KEY are set AND FEATURE_APPLE_LOGIN is on. Do not import
 * apple-idp.ts (node:crypto) into this module.
 */
export const getSignInProviders = createServerFn({ method: "GET" }).handler((): GrokProvider[] => {
  const nativeGoogle = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
  let host: string | null = null;
  try {
    host = getRequest()?.headers.get("host") ?? null;
  } catch {
    host = null;
  }
  // Random *.vercel.app previews and the broker host are not registered with Meta.
  const nativeFacebook = facebookLoginVisible(process.env) && Boolean(facebookOauthHost(host));
  const nativeApple = appleLoginVisible(process.env);
  const explicitBroker = Boolean(
    process.env.GROK_AUTH_CLIENT_ID?.trim() && process.env.GROK_AUTH_CLIENT_SECRET?.trim(),
  );
  const broker = explicitBroker || !process.env.VERCEL;
  const preferNative = Boolean(process.env.VERCEL);
  const list = visibleSignInProviders({
    nativeGoogle,
    nativeFacebook,
    nativeApple,
    nativeHuawei: huaweiSignInVisible(process.env),
    nativeAmazon: amazonSignInVisible(process.env),
    broker,
    preferNativeGoogle: preferNative,
  });
  let ua = "";
  let cookie = "";
  try {
    const req = getRequest();
    ua = req?.headers.get("user-agent") || "";
    cookie = req?.headers.get("cookie") || "";
  } catch {
    ua = "";
    cookie = "";
  }
  const signals = { userAgent: ua, cookie, search: "" };
  const native = nativeShellHidesAdmin(signals);
  const channel = storeChannelFromSignals(signals);
  return signInProvidersForDevice(list, {
    channel,
    playServices: googlePlayServicesAvailable(ua),
    native,
    platform: nativeSocialPlatform({ native, channel, userAgent: ua }),
  });
});
