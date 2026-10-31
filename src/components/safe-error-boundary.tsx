import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { isStaleAssetError, reloadStaleAssetOnce, safeErrorCopy } from "@/lib/safe-error";
import { reportError } from "@/lib/observe";
import { capturePostHogEvent } from "@/lib/posthog";
import { nativeShellHidesAdminNow } from "@/lib/native-admin";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";

const SAFE_ERROR_CSS =
  ".ke-safe-error{font-family:Plus Jakarta Sans,Segoe UI,sans-serif;background:#f6f3ee;color:#1c2438;padding:48px 20px;min-height:100dvh;box-sizing:border-box}" +
  ".ke-safe-error h1{font-size:1.75rem;margin:8px 0}" +
  ".ke-safe-kicker{font-size:12px;letter-spacing:.16em;text-transform:uppercase;margin:0}" +
  ".ke-safe-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:16px}" +
  ".ke-safe-actions a,.ke-safe-actions button{min-height:44px;min-width:44px;display:inline-flex;align-items:center;font-weight:600;background:transparent;color:#1c2438;border:0;padding:0;text-decoration:underline;cursor:pointer;touch-action:manipulation}";

/**
 * Route error screen. Logs the real error for support, and shows only the
 * fixed sentences in safeErrorCopy. No message, stack, query, or id.
 */
export function SafeRouteError({
  error,
  reset,
  links,
}: ErrorComponentProps & { links?: ReactNode }) {
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  reportError(error, { route: path || "app" });
  capturePostHogEvent("$exception", {
    $exception_type: error instanceof Error ? error.name : "Error",
    $exception_source: "error_boundary",
  });
  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.webdriver) return;
    void fetch("/api/automations?job=client-error", { method: "POST" }).catch(() => undefined);
  }, [error]);
  const copy = safeErrorCopy(path);
  const showAdmin = path.startsWith("/admin");

  useEffect(() => {
    if (!isStaleAssetError(error)) return;
    reloadStaleAssetOnce();
  }, [error]);

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: SAFE_ERROR_CSS }} />
      <main className="ke-safe-error" role="alert" data-ke="safe-error">
        <p className="ke-safe-kicker">KidEase</p>
        <h1>{copy.title}</h1>
        <p>{copy.body}</p>
        <p className="ke-safe-actions">
          <button
            type="button"
            onClick={() => {
              try {
                sessionStorage.removeItem("kidease-chunk-reload");
              } catch {
                /* ignore */
              }
              if (reset) reset();
              else window.location.reload();
            }}
          >
            {copy.retry}
          </button>
          {links ?? (
            <>
              {showAdmin && !nativeShellHidesAdminNow() ? <a href="/admin">{copy.admin}</a> : null}
              <a href="/search">{copy.explore}</a>
              <a href="/">{copy.home}</a>
              <a href={`mailto:${SUPPORT_INBOX_EMAIL}`}>{copy.support}</a>
            </>
          )}
        </p>
      </main>
    </>
  );
}
