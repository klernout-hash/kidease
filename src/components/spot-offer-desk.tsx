import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { spotOfferCopy } from "@/lib/spot-offer-copy";
import {
  exportCentreWaitlistAudit,
  listCentreWaitlist,
  sendCentreSpotOffer,
  setWaitlistSiblingPriority,
  type CentreWaitlistCard,
} from "@/lib/server/spot-offers";
import { useCopy } from "@/lib/use-copy";

function when(iso: string, locale: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(locale === "fr" ? "fr-CA" : "en-CA", { dateStyle: "medium" });
}

export function SpotOfferDesk() {
  const { locale } = useCopy();
  const copy = spotOfferCopy(locale);
  const [centres, setCentres] = useState<CentreWaitlistCard[] | null>(null);
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function load() {
    return listCentreWaitlist()
      .then((result) => {
        setCentres(result.centres);
        setEmailEnabled(result.emailEnabled);
      })
      .catch(() => setCentres([]));
  }

  useEffect(() => {
    let live = true;
    void listCentreWaitlist()
      .then((result) => {
        if (!live) return;
        setCentres(result.centres);
        setEmailEnabled(result.emailEnabled);
      })
      .catch(() => {
        if (live) setCentres([]);
      });
    return () => {
      live = false;
    };
  }, []);

  if (!centres) return <p className="mt-4 text-sm text-muted">{copy.deskTitle}</p>;
  if (!centres.length) return null;

  return (
    <section className="mb-8 rounded-xl bg-surface p-5 ring-1 ring-border" data-ke="spot-offer-desk">
      <h2 className="font-display text-2xl">{copy.deskTitle}</h2>
      <p className="mt-1 text-sm text-muted">{copy.deskLead}</p>
      {emailEnabled ? null : <p className="mt-2 text-sm text-muted">{copy.mailOff}</p>}
      {error ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 space-y-6">
        {centres.map((centre) => (
          <div key={centre.daycareId}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="font-medium">{centre.daycareName}</p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={centre.siblingPriority}
                    onChange={(event) => {
                      const on = event.target.checked;
                      void setWaitlistSiblingPriority({ data: { daycareId: centre.daycareId, on } })
                        .then(() => load())
                        .catch((err: unknown) => {
                          const message = err instanceof Error ? err.message : copy.feeBlocked;
                          setError(message);
                        });
                    }}
                  />
                  {locale === "fr" ? "Frères et sœurs d’abord" : "Siblings first"}
                </label>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    void exportCentreWaitlistAudit({ data: { daycareId: centre.daycareId } })
                      .then((result) => {
                        const blob = new Blob([result.csv], { type: "text/csv" });
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement("a");
                        link.href = url;
                        link.download = "waitlist-order.csv";
                        link.click();
                        URL.revokeObjectURL(url);
                      })
                      .catch((err: unknown) => {
                        const message = err instanceof Error ? err.message : copy.feeBlocked;
                        setError(message);
                      });
                  }}
                >
                  {locale === "fr" ? "Télécharger l’ordre" : "Download the order"}
                </Button>
              </div>
            </div>
            {centre.families.length ? (
              <ul className="mt-2 divide-y divide-border">
                {centre.families.map((family) => {
                  const waiting = family.status === "waiting";
                  const offered = family.status === "offered";
                  return (
                    <li key={family.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {family.parentName}
                          {family.childLabel ? ` · ${family.childLabel}` : ""}
                        </p>
                        <p className="text-sm text-muted">
                          {family.ageGroup} · {family.status}
                          {family.place ? ` · ${copy.place} ${family.place}` : ""} · {when(family.joinedAt, locale)}
                        </p>
                        {family.note ? <p className="mt-1 text-sm text-muted">{family.note}</p> : null}
                      </div>
                      {waiting && !centre.openOfferId ? (
                        <Button
                          type="button"
                          size="sm"
                          disabled={busy === family.id}
                          onClick={() => {
                            setBusy(family.id);
                            setError(null);
                            void sendCentreSpotOffer({ data: { waitlistId: family.id } })
                              .then(() => load())
                              .catch((err: unknown) => {
                                const message = err instanceof Error ? err.message : copy.feeBlocked;
                                setError(message);
                                toast.error(message);
                              })
                              .finally(() => setBusy(null));
                          }}
                        >
                          {copy.offerSpot}
                        </Button>
                      ) : null}
                      {offered ? <p className="text-sm text-muted">{copy.openOffer}</p> : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted">
                {copy.emptyDesk}{" "}
                <Link to="/daycare/$slug" params={{ slug: centre.slug }} className="text-primary underline-offset-4 hover:underline">
                  {centre.daycareName}
                </Link>
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
