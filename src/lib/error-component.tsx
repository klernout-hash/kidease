import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { isStaleAssetError, reloadStaleAssetOnce, safeErrorCopy } from "@/lib/safe-error";
import { reportError } from "@/lib/observe";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  reportError(error, { route: path || "app" });
  const copy = safeErrorCopy(path);

  useEffect(() => {
    if (!isStaleAssetError(error)) return;
    reloadStaleAssetOnce();
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg" data-ke="safe-error">
      <span className="text-danger" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="font-display text-lg">{copy.title}</h1>
      <p className="max-w-md text-sm text-muted">{copy.body}</p>
      <div className="mt-3 flex flex-col items-center gap-2 sm:flex-row">
        <button
          type="button"
          className="min-h-11 rounded-full bg-fg px-5 text-sm font-semibold text-bg"
          onClick={() => {
            try {
              sessionStorage.removeItem("kidease-chunk-reload");
            } catch {
              /* ignore */
            }
            window.location.reload();
          }}
        >
          {copy.retry}
        </button>
        <a
          href="/"
          className="inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-fg ring-1 ring-border"
        >
          Back to home
        </a>
        <a href={`mailto:${SUPPORT_INBOX_EMAIL}`} className="inline-flex min-h-11 items-center text-sm font-medium text-muted underline-offset-4 hover:underline">
          Email support
        </a>
      </div>
    </main>
  );
}
