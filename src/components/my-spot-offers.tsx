import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { spotOfferCopy } from "@/lib/spot-offer-copy";
import { listMySpotOffers, respondMySpotOffer, type MySpotOfferRow } from "@/lib/server/spot-offers";
import { listMyWaitlists } from "@/lib/server/waitlist-tracker";
import { localePath } from "@/lib/locale-path";
import { useCopy } from "@/lib/use-copy";
import { RuntimePaused } from "@/components/runtime-paused";
import { useRuntimeSwitches } from "@/lib/use-runtime-switches";
import { pipelineCopy } from "@/lib/pipeline-copy";
import { countdownLabel, offerCountdown } from "@/lib/pipeline-features";

function when(iso: string, locale: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium", timeStyle: "short" });
}

async function loadSpotOffers() {
  const { rows } = await listMySpotOffers();
  if (rows.length) return { rows, hasWaitlists: false };
  const { requests, centres, areas } = await listMyWaitlists();
  return { rows, hasWaitlists: Boolean(requests.length || centres.length || areas.length) };
}

export function MySpotOffers() {
  const { locale } = useCopy();
  const waitlistOn = useRuntimeSwitches().waitlistSpots;
  const copy = spotOfferCopy(locale);
  const { user, isPending } = useCurrentUserState();
  const [result, setResult] = useState<{ rows: MySpotOfferRow[]; hasWaitlists: boolean } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const rows = result?.rows ?? null;
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const pc = pipelineCopy(locale);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  function load() {
    setLoadFailed(false);
    return loadSpotOffers()
      .then(setResult)
      .catch(() => setLoadFailed(true));
  }

  useEffect(() => {
    if (isPending || !user || !waitlistOn) return;
    let live = true;
    void loadSpotOffers()
      .then((data) => {
        if (live) setResult(data);
      })
      .catch(() => {
        if (live) setLoadFailed(true);
      });
    return () => {
      live = false;
    };
  }, [user, isPending, waitlistOn]);

  if (!waitlistOn) {
    return (
      <Shell>
        <main className="ke-gutter mx-auto w-full max-w-3xl py-8">
          <RuntimePaused id="waitlistSpots" />
        </main>
      </Shell>
    );
  }

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
        {rows === null && !loadFailed ? <p className="mt-6 text-sm text-muted">{copy.mineTitle}</p> : null}
        {loadFailed ? (
          <div className="mt-6 space-y-2">
            <p role="alert">{copy.offersUnavailable}</p>
            <Button type="button" variant="secondary" onClick={() => void load()}>{copy.tryAgain}</Button>
          </div>
        ) : null}
        {result && !rows?.length ? (
          <div className="mt-6 space-y-2" data-ke="spot-offers-empty">
            <h2 className="font-medium">{copy.noOffers}</h2>
            <p className="text-sm text-muted">{result.hasWaitlists ? copy.waitlistsElsewhere : copy.emptyMine}</p>
            <Button asChild>
              {result.hasWaitlists ? (
                <Link to={localePath("/parent", locale)} search={{ tab: "waitlists" }}>{copy.seeWaitlists}</Link>
              ) : (
                <Link to={localePath("/search", locale)}>{copy.findCare}</Link>
              )}
            </Button>
          </div>
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
                  {pc.ages[row.ageGroup]} · {pc.statuses[row.status]}
                  {row.place ? ` · ${copy.place} ${row.place}` : ""}
                </p>
                {row.offerStatus === "open" && row.expiresAt ? (
                  <p className="mt-1 text-sm text-muted">
                    {copy.answerBy} {when(row.expiresAt, locale)}
                    <span className="ml-1 font-medium text-fg" data-ke="parent-offer-countdown">
                      · {countdownLabel(offerCountdown(row.expiresAt, now), locale)}
                    </span>
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
