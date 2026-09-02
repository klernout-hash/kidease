/**
 * Grok auth broker env (server-only — do not import from the client).
 *
 * Keep the broker path when `GROK_AUTH_CLIENT_ID` + `GROK_AUTH_CLIENT_SECRET`
 * are present (Grok live preview / grok.me). The shared preview client is
 * sandbox/local only — Vercel production must not fall back to it, because
 * that client only allows `*.grok-sandbox.com` callbacks.
 */
import {
  GROK_ISSUER_DEFAULT,
  PREVIEW_CLIENT_ID,
  PREVIEW_CLIENT_SECRET,
} from "./preview";

const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

export const grokIssuer = env("GROK_AUTH_ISSUER") ?? GROK_ISSUER_DEFAULT;

export const grokBrokerExplicit = Boolean(
  env("GROK_AUTH_CLIENT_ID") && env("GROK_AUTH_CLIENT_SECRET"),
);

/** Preview client: local / Grok sandbox only — never Vercel. */
export const grokPreviewBroker = !grokBrokerExplicit && !process.env.VERCEL;

export const grokBrokerConfigured = grokBrokerExplicit || grokPreviewBroker;

export const grokClientId = env("GROK_AUTH_CLIENT_ID") ?? (grokPreviewBroker ? PREVIEW_CLIENT_ID : undefined);
export const grokClientSecret =
  env("GROK_AUTH_CLIENT_SECRET") ?? (grokPreviewBroker ? PREVIEW_CLIENT_SECRET : undefined);
