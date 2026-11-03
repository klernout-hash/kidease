import { Link, useRouter } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { useCopy } from "@/lib/use-copy";

/** Shared loading state for the daycare tools: calm skeleton, announced as busy. */
export function ToolPending() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  return (
    <Shell>
      <main data-ke="tool-pending" aria-busy="true" className="mx-auto w-full max-w-3xl px-4 py-6">
        <span className="sr-only" role="status">{fr ? "Chargement…" : "Loading…"}</span>
        <div className="h-4 w-24 animate-pulse rounded-md bg-surface-2 motion-reduce:animate-none" />
        <div className="mt-3 h-8 w-2/3 animate-pulse rounded-md bg-surface-2 motion-reduce:animate-none" />
        <div className="mt-4 h-4 w-full animate-pulse rounded-md bg-surface-2 motion-reduce:animate-none" />
        <div className="mt-6 h-32 w-full animate-pulse rounded-lg bg-surface-2 motion-reduce:animate-none" />
      </main>
    </Shell>
  );
}

/** Shared error state for the daycare tools: plain words, retry, way back. Never shows raw errors. */
export function ToolError() {
  const router = useRouter();
  const { locale } = useCopy();
  const fr = locale === "fr";
  return (
    <Shell>
      <main data-ke="tool-error" className="mx-auto w-full max-w-3xl px-4 py-6">
        <div role="alert" className="rounded-lg bg-surface px-5 py-6 ring-1 ring-border">
          <h1 className="font-display text-2xl tracking-tight">{fr ? "Cette page n’a pas chargé" : "This page didn’t load"}</h1>
          <p className="mt-2 text-sm text-muted">{fr ? "Rien n’a changé. Réessayez dans un instant." : "Nothing was changed. Try again in a moment."}</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void router.invalidate()}>{fr ? "Réessayer" : "Try again"}</Button>
            <Link to="/provider" className="inline-flex min-h-11 items-center justify-center rounded-md px-5 font-medium text-primary ring-1 ring-border">
              {fr ? "Retour au centre" : "Back to the centre"}
            </Link>
          </div>
        </div>
      </main>
    </Shell>
  );
}
