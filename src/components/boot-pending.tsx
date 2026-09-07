import { useEffect, useState } from "react";
import { SUPPORT_INBOX_EMAIL } from "@/lib/support";
import { BOOT_SETTLE_MS } from "@/lib/timeout";
import { PageSkeleton } from "@/components/page-skeleton";

/**
 * Index-route pending UI only (never on the root document). Must never be a
 * BrandMark — a hung loader plus a logo is the production “logo loop”, and
 * replacing `<html>` with pending UI drops the stylesheet.
 */
export function BootPending() {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setFailed(true), BOOT_SETTLE_MS);
    return () => window.clearTimeout(t);
  }, []);

  if (!failed) {
    return (
      <div role="status" aria-live="polite" aria-label="Starting KidEase">
        <PageSkeleton hero cards={3} />
      </div>
    );
  }

  return (
    <main className="mx-auto grid min-h-dvh max-w-lg place-items-center px-6 py-16 text-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">KidEase</p>
        <h1 className="mt-3 font-display text-2xl text-fg">KidEase could not finish loading</h1>
        <p className="mt-3 text-sm text-muted">
          The home page waited too long for search or your sign-in session. This is not an infinite
          spinner — refresh, or try again on https://www.kidease.ca. If it keeps happening, email{" "}
          {SUPPORT_INBOX_EMAIL}.
        </p>
        <button
          type="button"
          className="mt-6 min-h-11 rounded-full bg-fg px-5 text-sm font-semibold text-bg"
          onClick={() => window.location.assign("/")}
        >
          Try again
        </button>
      </div>
    </main>
  );
}
