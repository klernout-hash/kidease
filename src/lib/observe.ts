/**
 * Shared error hook. Logs always. If Sentry was initialized (DSN set),
 * forwards to the SDK. No-op ingest when DSN is unset so local/dev still boots.
 */

export type ObserveContext = {
  route?: string;
  extra?: Record<string, string | number | boolean | null | undefined>;
};

type Capture = (error: Error, context: ObserveContext) => void;

let capture: Capture | null = null;

export function registerErrorCapture(fn: Capture) {
  capture = fn;
}

function asError(err: unknown) {
  if (err instanceof Error) return err;
  return new Error(typeof err === "string" ? err : "Unknown error");
}

/** Redirects, 404s, and expected auth gates are not production incidents. */
function isControlFlow(err: unknown) {
  if (!err || typeof err !== "object") return false;
  const flagged = err as { isRedirect?: boolean; isNotFound?: boolean; name?: string; message?: string };
  if (flagged.isRedirect || flagged.isNotFound) return true;
  const name = flagged.name || "";
  const message = flagged.message || "";
  return (
    name === "UnauthorizedError" ||
    name === "CrossSiteRequestError" ||
    message === "Unauthorized" ||
    message === "Not authorized"
  );
}

export function reportError(err: unknown, context: ObserveContext = {}) {
  if (isControlFlow(err)) return;
  const error = asError(err);
  const route = context.route || "app";
  console.error(`[kidease-alert] ${route}`, error.message, context.extra ?? "", error.stack ?? "");
  capture?.(error, context);
}
