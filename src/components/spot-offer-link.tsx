import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { spotOfferCopy } from "@/lib/spot-offer-copy";
import { previewSpotOfferLink, respondSpotOfferLink } from "@/lib/server/spot-offers";
import { useCopy } from "@/lib/use-copy";

export function SpotOfferLink({ token }: { token: string }) {
  const { locale } = useCopy();
  const copy = spotOfferCopy(locale);
  const [view, setView] = useState<{ daycareName: string; expiresAt: string; status: string } | null | undefined>(
    undefined,
  );
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void previewSpotOfferLink({ data: token })
      .then((result) => {
        if (!live) return;
        setView(result.ok ? { daycareName: result.daycareName, expiresAt: result.expiresAt, status: result.status } : null);
      })
      .catch(() => {
        if (live) setView(null);
      });
    return () => {
      live = false;
    };
  }, [token]);

  const open = view && view.status === "open";

  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-xl py-8">
        <p className="text-sm font-semibold text-primary">{copy.pageKicker}</p>
        <h1 className="mt-2 font-display text-3xl">{copy.pageTitle}</h1>
        <p className="mt-3 text-muted">{copy.what}</p>
        <p className="mt-2 text-muted">{copy.why}</p>
        {view === undefined ? <p className="mt-6 text-sm text-muted">{copy.mineTitle}</p> : null}
        {view === null ? (
          <EmptyState title={copy.invalidLink} body={copy.ended} action={copy.searchAgain} actionTo="/search" />
        ) : null}
        {view ? (
          <div className="mt-6 rounded-xl bg-surface p-4 ring-1 ring-border">
            <p className="font-medium">{view.daycareName}</p>
            <p className="mt-2 text-sm text-muted">{copy.pageLead}</p>
            <p className="mt-2 text-sm text-muted">{copy.nextStep}</p>
            {note ? (
              <p className="mt-3 text-sm" role="status">
                {note}
              </p>
            ) : null}
            {open ? (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void respondSpotOfferLink({ data: { token, decision: "accept" } })
                      .then(() => setNote(copy.accepted))
                      .catch((err: unknown) => setNote(err instanceof Error ? err.message : copy.ended))
                      .finally(() => setBusy(false));
                  }}
                >
                  {copy.accept}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void respondSpotOfferLink({ data: { token, decision: "decline" } })
                      .then(() => setNote(copy.declinedNote))
                      .catch((err: unknown) => setNote(err instanceof Error ? err.message : copy.ended))
                      .finally(() => setBusy(false));
                  }}
                >
                  {copy.decline}
                </Button>
              </div>
            ) : (
              <p className="mt-3 text-sm text-muted">{copy.ended}</p>
            )}
            <p className="mt-4 text-sm">
              <Link to="/search" className="text-primary underline-offset-4 hover:underline">
                {copy.findCare}
              </Link>
            </p>
          </div>
        ) : null}
      </main>
    </Shell>
  );
}
