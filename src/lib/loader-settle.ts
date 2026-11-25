/**
 * Loading placeholders must settle. A fetch that hangs or fails becomes an
 * error state with "Try again" within LOADER_WATCHDOG_MS, never a spinner forever.
 * Pure apart from the capture call, so scripts/loader-settle.test.mjs loads it in Node.
 */
import { capturePostHogEvent } from "./posthog.ts";
import { exceptionTypeName, sanitizeExceptionMessage } from "./posthog-errors.ts";
import { reportError } from "./observe.ts";

/** The longest a parent waits before a stuck placeholder turns into "Try again". */
export const LOADER_WATCHDOG_MS = 10_000;

export type LoaderSurface = "search" | "parent-explore" | "parent-children" | "parent-extras";

export type LoaderOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "timeout" | "error"; error: Error };

function asError(error: unknown, fallback: string): Error {
  if (error instanceof Error) return error;
  return new Error(typeof error === "string" && error ? error : fallback);
}

/** Resolve once: the value, or an error / timeout outcome. Never rejects, never hangs. */
export function settleLoader<T>(promise: Promise<T>, ms = LOADER_WATCHDOG_MS): Promise<LoaderOutcome<T>> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      resolve({ ok: false, reason: "timeout", error: new Error("loader-timeout") });
    }, ms);
    promise.then(
      (value) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ ok: true, value });
      },
      (error: unknown) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ ok: false, reason: "error", error: asError(error, "loader-error") });
      },
    );
  });
}

/** One $exception per stuck or failed loader, tagged with the page surface. */
export function captureLoaderFailure(surface: LoaderSurface, error: unknown, reason: "timeout" | "error" = "error"): void {
  const err = asError(error, `${surface}-${reason}`);
  try {
    reportError(err, { route: surface, extra: { surface, reason } });
    capturePostHogEvent("$exception", {
      $exception_type: exceptionTypeName(err),
      $exception_message: sanitizeExceptionMessage(err),
      $exception_source: surface,
      surface,
      reason,
    });
  } catch {
    /* telemetry never breaks the page */
  }
}
