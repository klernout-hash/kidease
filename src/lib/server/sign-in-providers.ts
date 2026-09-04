import { createServerFn } from "@tanstack/react-start";
import { visibleSignInProviders, type GrokProvider } from "@/lib/auth/providers";

/**
 * Sign-in buttons the login page should render.
 * Google when native Google or the Grok broker is configured.
 * Facebook is always listed so the Login with Facebook pill shows;
 * wire FACEBOOK_CLIENT_ID + FACEBOOK_CLIENT_SECRET to make the click work.
 */
export const getSignInProviders = createServerFn({ method: "GET" }).handler((): GrokProvider[] => {
  const nativeGoogle = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
  const nativeFacebook = true;
  const explicitBroker = Boolean(
    process.env.GROK_AUTH_CLIENT_ID?.trim() && process.env.GROK_AUTH_CLIENT_SECRET?.trim(),
  );
  const broker = explicitBroker || !process.env.VERCEL;
  const preferNative = Boolean(process.env.VERCEL);
  return visibleSignInProviders({
    nativeGoogle,
    nativeFacebook,
    broker,
    preferNativeGoogle: preferNative,
  });
});
