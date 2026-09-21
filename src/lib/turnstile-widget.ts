/**
 * Turnstile widget ↔ React token sync.
 *
 * `turnstile.reset()` can invoke the success callback before it returns when
 * the visitor is already cleared. Clearing React state *after* that reset
 * leaves the checkbox on Success while `token` is empty, so Sign in stays
 * disabled. Clear first, then reset, and let a synchronous callback win.
 *
 * The token also lives in a hidden `cf-turnstile-response` input. A widget
 * that was auto-rendered (`.cf-turnstile` + an implicit api.js) never calls
 * our React callback. Submit must read that field.
 */

export const TURNSTILE_RESPONSE_FIELD = "cf-turnstile-response";

type TokenListener = (token: string) => void;

export function beginTurnstileReset(onToken: TokenListener, reset: () => void): void {
  onToken("");
  reset();
}

export function readTurnstileResponseValue(
  root: { querySelector(selector: string): { value?: string | null } | null } | null | undefined,
): string {
  if (!root) return "";
  const input = root.querySelector(`input[name="${TURNSTILE_RESPONSE_FIELD}"]`);
  return (input?.value || "").trim();
}

/** Prefer React state, then the live widget field if state was wiped. */
export function coalesceTurnstileToken(state: string, live: string): string {
  const fromState = state.trim();
  if (fromState) return fromState;
  return live.trim();
}

type HeaderSetter = { set(name: string, value: string): void };

/**
 * Put the widget token on the headers Better Auth already forwards and in
 * the JSON body. Cloudflare (and some proxies) drop `x-turnstile-token`.
 * `/api/auth` reads both.
 */
export function attachTurnstileToRequest<T extends { headers: HeaderSetter; body?: unknown }>(
  ctx: T,
  token: string,
): T {
  const trimmed = token.trim();
  if (!trimmed) return ctx;
  ctx.headers.set("x-turnstile-token", trimmed);
  ctx.headers.set("x-captcha-response", trimmed);
  ctx.headers.set("cf-turnstile-response", trimmed);
  ctx.body = mergeTurnstileBody(ctx.body, trimmed);
  return ctx;
}

export function mergeTurnstileBody(body: unknown, token: string): unknown {
  const trimmed = token.trim();
  if (!trimmed) return body;
  if (typeof body === "string") {
    try {
      const json = JSON.parse(body) as unknown;
      if (json && typeof json === "object" && !Array.isArray(json)) {
        return JSON.stringify({ ...(json as Record<string, unknown>), turnstileToken: trimmed });
      }
    } catch {
      return body;
    }
    return body;
  }
  if (body && typeof body === "object" && !Array.isArray(body)) {
    return { ...(body as Record<string, unknown>), turnstileToken: trimmed };
  }
  return body;
}
