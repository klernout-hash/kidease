import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { reportError } from "@/lib/observe";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";

function isStaleChunk(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /importing a module script failed|failed to fetch dynamically imported module|loading chunk|error loading dynamically imported module/i.test(
    msg,
  );
}

function publicErrorMessage(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (!msg.trim()) return "An unexpected error occurred. Try reloading the page.";
  if (
    msg.length > 140 ||
    /stack|TypeError|ReferenceError|SyntaxError|at https?:|\/src\/|node_modules/i.test(msg)
  ) {
    return "An unexpected error occurred. Try reloading the page.";
  }
  return msg;
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  reportError(error, { route: typeof window !== "undefined" ? window.location.pathname : "app" });

  useEffect(() => {
    if (typeof window === "undefined" || !isStaleChunk(error)) return;
    const key = "kidease-chunk-reload";
    if (sessionStorage.getItem(key) === "1") return;
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }, [error]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      <span className="text-danger" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="font-display text-lg">Something went wrong</h1>
      <p className="max-w-md text-sm break-words text-muted">{publicErrorMessage(error)}</p>
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
            window.location.assign("/search");
          }}
        >
          Reload Explore
        </button>
        <a
          href="/"
          className="inline-flex min-h-11 items-center rounded-full px-5 text-sm font-semibold text-fg ring-1 ring-border"
        >
          Back to home
        </a>
        <a href={`mailto:${SUPPORT_INBOX_EMAIL}`} className="text-sm font-medium text-muted underline-offset-4 hover:underline">
          Email support
        </a>
      </div>
    </main>
  );
}
