import { createServerFn } from "@tanstack/react-start";
import { visibleSignInProviders, type GrokProvider } from "@/lib/auth/providers";

/**
 * Sign-in buttons the login page should render.
 * Google when native Google or the Grok broker is configured.
 * Facebook only when FACEBOOK_CLIENT_ID + FACEBOOK_CLIENT_SECRET are set
 * (no broker path — hide the button rather than show a dead click).
 * Apple only when APPLE_CLIENT_ID + APPLE_TEAM_ID + APPLE_KEY_ID +
 * APPLE_PRIVATE_KEY are set (same four keys Better Auth needs). Check env
 * here — do not import apple-idp.ts (node:crypto) into this module.
 */
export const getSignInProviders = createServerFn({ method: "GET" }).handler((): GrokProvider[] => {
  const nativeGoogle = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
  const nativeFacebook = Boolean(
    process.env.FACEBOOK_CLIENT_ID?.trim() && process.env.FACEBOOK_CLIENT_SECRET?.trim(),
  );
  const nativeApple = Boolean(
    process.env.APPLE_CLIENT_ID?.trim() &&
      process.env.APPLE_TEAM_ID?.trim() &&
      process.env.APPLE_KEY_ID?.trim() &&
      process.env.APPLE_PRIVATE_KEY?.trim(),
  );
  const explicitBroker = Boolean(
    process.env.GROK_AUTH_CLIENT_ID?.trim() && process.env.GROK_AUTH_CLIENT_SECRET?.trim(),
  );
  const broker = explicitBroker || !process.env.VERCEL;
  const preferNative = Boolean(process.env.VERCEL);
  return visibleSignInProviders({
    nativeGoogle,
    nativeFacebook,
    nativeApple,
    broker,
    preferNativeGoogle: preferNative,
  });
});
