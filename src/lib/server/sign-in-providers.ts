import { createServerFn } from "@tanstack/react-start";
import { visibleSignInProviders, type GrokProvider } from "@/lib/auth/providers";

/**
 * Sign-in buttons the login page should render.
 *
 * Google is included when native Google (`GOOGLE_CLIENT_*`) or the Grok broker
 * is configured. X is included when native X (`TWITTER_CLIENT_*`) or the
 * broker is configured. Broker = explicit `GROK_AUTH_CLIENT_ID` + `SECRET`,
 * or the sandbox preview client (not Vercel).
 *
 * Env is read inside the handler only — do not import `google-idp` /
 * `twitter-idp` / `preview` from this module (those must stay off the
 * client graph).
 */
export const getSignInProviders = createServerFn({ method: "GET" }).handler((): GrokProvider[] => {
  const nativeGoogle = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
  const nativeTwitter = Boolean(
    process.env.TWITTER_CLIENT_ID?.trim() && process.env.TWITTER_CLIENT_SECRET?.trim(),
  );
  const explicitBroker = Boolean(
    process.env.GROK_AUTH_CLIENT_ID?.trim() && process.env.GROK_AUTH_CLIENT_SECRET?.trim(),
  );
  const broker = explicitBroker || !process.env.VERCEL;
  const preferNative = Boolean(process.env.VERCEL);
  return visibleSignInProviders({
    nativeGoogle,
    nativeTwitter,
    broker,
    preferNativeGoogle: preferNative,
    preferNativeTwitter: preferNative,
  });
});
