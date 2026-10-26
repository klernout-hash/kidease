/**
 * Copy for a crashed screen. The function never receives the error, so the
 * page cannot echo a SQL message, a stack, or a connection string.
 */

export type SafeErrorCopy = {
  title: string;
  body: string;
  retry: string;
  home: string;
  explore: string;
  admin: string;
  support: string;
};

export function safeErrorCopy(pathname: string): SafeErrorCopy {
  const path = String(pathname || "");
  const fr = path === "/fr" || path.startsWith("/fr/");
  if (fr) {
    return {
      title: "Quelque chose s'est mal passé",
      body: "Actualisez la page, ou retournez à l'accueil. Si ça continue, écrivez au soutien.",
      retry: "Réessayer",
      home: "Accueil",
      explore: "Explorer",
      admin: "Admin",
      support: "Écrire au soutien",
    };
  }
  return {
    title: "Something went wrong",
    body: "Refresh the page, or go back home. If it keeps happening, email support.",
    retry: "Try again",
    home: "Home",
    explore: "Explore",
    admin: "Admin",
    support: "Email support",
  };
}

const STALE_ASSET =
  /importing a module script failed|failed to fetch dynamically imported module|loading chunk|chunkloaderror|error loading dynamically imported module|dynamically imported module|unable to preload css|expected a javascript|mime type|text\/html|module script/i;

function staleAssetMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return `${error.name} ${error.message}`;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message ?? "");
  }
  return String(error ?? "");
}

/**
 * True for a stale or missing app chunk. A 404 HTML body is a module-script
 * MIME error, which the older phrase list did not match, so the desk stayed
 * on the error screen. The message is never shown on screen.
 */
export function isStaleAssetError(error: unknown): boolean {
  const msg = staleAssetMessage(error);
  if (/posthog/i.test(msg)) return false;
  if (error instanceof Error && error.name === "ChunkLoadError") return true;
  return STALE_ASSET.test(msg);
}

const CHUNK_RELOAD_KEY = "kidease-chunk-reload";

/** One reload per tab. A second failure stays on the error screen. */
export function reloadStaleAssetOnce(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1") return false;
    sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}

/** Catch chunk failures that never reach the route error component. */
export function installStaleChunkReload(): void {
  if (typeof window === "undefined") return;
  const host = window as Window & { __keChunkReload?: boolean };
  if (host.__keChunkReload) return;
  host.__keChunkReload = true;
  const onError = (event: Event) => {
    const reason =
      event instanceof PromiseRejectionEvent
        ? event.reason
        : `${(event as ErrorEvent).message || ""} ${(event as ErrorEvent).error || ""}`;
    if (!isStaleAssetError(reason)) return;
    reloadStaleAssetOnce();
  };
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onError);
}
