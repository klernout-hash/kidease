/**
 * Continue with Google stays off until GOOGLE_SIGNIN_ENABLED is turned on.
 * The KidEase Google Cloud project is suspended (Error 401 disabled_client).
 * GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET stay in env and are not read here.
 * Maps keys are a different flag. Not a PostHog product flag.
 */

export const GOOGLE_SIGNIN_FLAG = "GOOGLE_SIGNIN_ENABLED";

type GoogleSignInEnv = {
  GOOGLE_SIGNIN_ENABLED?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  GROK_AUTH_CLIENT_ID?: string;
  GROK_AUTH_CLIENT_SECRET?: string;
  VERCEL?: string;
};

function flagOn(raw: string | undefined | null): boolean {
  const value = String(raw || "")
    .trim()
    .toLowerCase();
  return value === "1" || value === "true" || value === "on" || value === "yes";
}

/** Button and Better Auth Google provider. Unset means off. */
export function googleSignInEnabled(env: GoogleSignInEnv = process.env): boolean {
  return flagOn(env.GOOGLE_SIGNIN_ENABLED);
}

/**
 * Native Google needs the flag plus GOOGLE_CLIENT_*.
 * Broker Google needs the flag plus an explicit Grok client, or any non-Vercel host.
 */
export function googleSignInOffered(env: GoogleSignInEnv = process.env): {
  native: boolean;
  broker: boolean;
} {
  const on = googleSignInEnabled(env);
  const native = Boolean(env.GOOGLE_CLIENT_ID?.trim() && env.GOOGLE_CLIENT_SECRET?.trim());
  const explicitBroker = Boolean(
    env.GROK_AUTH_CLIENT_ID?.trim() && env.GROK_AUTH_CLIENT_SECRET?.trim(),
  );
  const broker = explicitBroker || !env.VERCEL;
  return { native: on && native, broker: on && broker };
}
