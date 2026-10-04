import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { spotOfferCopy } from "@/lib/spot-offer-copy";
import { listMySpotOffers, respondMySpotOffer, type MySpotOfferRow } from "@/lib/server/spot-offers";
import { useCopy } from "@/lib/use-copy";

function when(iso: string, locale: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short" });
}

export function MySpotOffers() {
  const { locale } = useCopy();
  const copy = spotOfferCopy(locale);
  const { user, isPending } = useCurrentUserState();
  const [rows, setRows] = useState<MySpotOfferRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function load() {
    return listMySpotOffers()
      .then((result) => setRows(result.rows))
      .catch(() => setRows([]));
  }

  useEffect(() => {
    if (isPending || !user) return;
    let live = true;
    void listMySpotOffers()
      .then((result) => {
        if (live) setRows(result.rows);
      })
      .catch(() => {
        if (live) setRows([]);
      });
    return () => {
      live = false;
    };
  }, [user, isPending]);

  if (isPending) {
    return (
      <Shell>
        <p className="ke-gutter py-8 text-sm text-muted">{copy.mineTitle}</p>
      </Shell>
    );
  }
  if (!user) return <RedirectToSignIn />;

  const open = rows?.find((row) => row.offerStatus === "open" && row.offerId) ?? null;

  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-3xl py-8">
        <p className="text-sm font-semibold text-primary">{copy.pageKicker}</p>
        <h1 className="mt-2 font-display text-3xl">{copy.pageTitle}</h1>
        <p className="mt-3 text-muted">{copy.what}</p>
        <p className="mt-2 text-muted">{copy.why}</p>
        <p className="mt-2 text-muted">{copy.pageLead}</p>
        {note ? (
          <p className="mt-3 text-sm" role="status">
            {note}
          </p>
        ) : null}
        {rows === null ? <p className="mt-6 text-sm text-muted">{copy.mineTitle}</p> : null}
        {rows && !rows.length ? (
          <EmptyState title={copy.emptyMine} body={copy.mineLead} action={copy.findCare} actionTo="/search" />
        ) : null}
        {rows && rows.length ? (
          <ul className="mt-6 divide-y divide-border">
            {rows.map((row) => (
              <li key={row.id} className="py-4">
                <p className="font-medium">
                  <Link to="/daycare/$slug" params={{ slug: row.slug }} className="hover:underline">
                    {row.daycareName}
                  </Link>
                </p>
                <p className="mt-1 text-sm text-muted">
                  {row.ageGroup} · {row.status}
                  {row.place ? ` · ${copy.place} ${row.place}` : ""}
                </p>
                {row.offerStatus === "open" && row.expiresAt ? (
                  <p className="mt-1 text-sm text-muted">
                    {copy.answerBy} {when(row.expiresAt, locale)}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {open?.offerId ? (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              disabled={busy === open.offerId}
              onClick={() => {
                setBusy(open.offerId);
                void respondMySpotOffer({ data: { offerId: open.offerId!, decision: "accept" } })
                  .then(() => {
                    setNote(copy.accepted);
                    return load();
                  })
                  .catch((err: unknown) => setNote(err instanceof Error ? err.message : copy.ended))
                  .finally(() => setBusy(null));
              }}
            >
              {copy.accept}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy === open.offerId}
              onClick={() => {
                setBusy(open.offerId);
                void respondMySpotOffer({ data: { offerId: open.offerId!, decision: "decline" } })
                  .then(() => {
                    setNote(copy.declinedNote);
                    return load();
                  })
                  .catch((err: unknown) => setNote(err instanceof Error ? err.message : copy.ended))
                  .finally(() => setBusy(null));
              }}
            >
              {copy.decline}
            </Button>
          </div>
        ) : rows && rows.length ? (
          <div className="mt-4">
            <Button asChild>
              <Link to="/search">{copy.findCare}</Link>
            </Button>
          </div>
        ) : null}
      </main>
    </Shell>
  );
}
