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

/** True only for a stale app chunk. The message is never shown on screen. */
export function isStaleAssetError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  if (/posthog/i.test(msg)) return false;
  return /importing a module script failed|failed to fetch dynamically imported module|loading chunk|error loading dynamically imported module/i.test(
    msg,
  );
}
