import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { isStaleAssetError, reloadStaleAssetOnce, safeErrorCopy } from "@/lib/safe-error";
import { reportError } from "@/lib/observe";
import { capturePostHogEvent } from "@/lib/posthog";
import { nativeShellHidesAdminNow } from "@/lib/native-admin";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";

const SAFE_ERROR_CSS =
  ".ke-safe-actions a,.ke-safe-actions button{min-height:44px;min-width:44px;display:inline-flex;align-items:center;font-weight:600;background:transparent;color:#1c2438;border:0;padding:0;text-decoration:underline;cursor:pointer;touch-action:manipulation}";

/**
 * EM3 (Fire 7 / HD10): the error screen painted with no styles at all. Inline
 * style attributes survive when every stylesheet and <style> tag is gone.
 */
const MAIN_STYLE: CSSProperties = {
  fontFamily: "Plus Jakarta Sans, Segoe UI, Roboto, sans-serif",
  background: "#f7f7f8",
  color: "#141210",
  padding: "calc(48px + env(safe-area-inset-top, 0px)) 20px 48px",
  minHeight: "100vh",
  boxSizing: "border-box",
  lineHeight: 1.5,
};
const KICKER_STYLE: CSSProperties = { fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", margin: 0 };
const TITLE_STYLE: CSSProperties = { fontSize: "1.75rem", margin: "8px 0", lineHeight: 1.2 };
const ACTIONS_STYLE: CSSProperties = { display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16, alignItems: "center" };
const ACTION_STYLE: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  display: "inline-flex",
  alignItems: "center",
  fontWeight: 600,
  background: "transparent",
  color: "#1c2438",
  border: 0,
  padding: 0,
  textDecoration: "underline",
  cursor: "pointer",
  font: "inherit",
};

/** Android System WebView older than Chrome 100 (Fire OS 7/8 ships 91). */
function oldAndroidWebView(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (!/Android/.test(ua) || !/KidEaseNative|; wv\)/.test(ua)) return false;
  const major = Number((ua.match(/Chrome\/(\d+)/) || [])[1] || 0);
  return major > 0 && major < 100;
}

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
      <main className="ke-safe-error" role="alert" data-ke="safe-error" style={MAIN_STYLE}>
        <p className="ke-safe-kicker" style={KICKER_STYLE}>KidEase</p>
        <h1 style={TITLE_STYLE}>{copy.title}</h1>
        <p>{copy.body}</p>
        {oldAndroidWebView() ? <p data-ke="safe-error-webview">{copy.webview}</p> : null}
        <p className="ke-safe-actions" style={ACTIONS_STYLE}>
          <button
            type="button"
            style={ACTION_STYLE}
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
