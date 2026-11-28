import { useEffect, useState } from "react";
import { loadAdminPayouts, type AdminPayoutsPage } from "@/lib/server/admin-payouts";
import { formatCad } from "@/lib/cad-format";
import { useCopy } from "@/lib/use-copy";

function yesNo(on: boolean, fr: boolean): string {
  return on ? (fr ? "Oui" : "On") : (fr ? "Non" : "Off");
}

export function AdminPayoutsPanel() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const cad = (amount: number) => formatCad(amount, locale, { maximumFractionDigits: 0 });
  const [page, setPage] = useState<AdminPayoutsPage | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    void loadAdminPayouts()
      .then((next) => {
        if (live) setPage(next);
      })
      .catch(() => {
        if (live) setError(fr ? "Impossible de lire les paiements." : "Could not read payments.");
      });
    return () => {
      live = false;
    };
  }, [fr]);

  return (
    <section data-ke="admin-payouts">
      <h2 className="font-display text-2xl">{fr ? "Paiements et versements" : "Payments and payouts"}</h2>
      <p className="mt-2 max-w-prose text-sm leading-6 text-muted">
        {fr
          ? "Lecture seule. Comptes Connect, versements et charges déjà enregistrés. Cette page n’appelle pas Stripe et ne déplace pas d’argent."
          : "Read only. Connect accounts, payouts, and charges already saved here. This page does not call Stripe and does not move money."}
      </p>
      {error ? <p className="mt-4 text-sm text-danger" role="alert">{error}</p> : null}
      {!page && !error ? <p className="mt-4 text-sm text-muted">{fr ? "Chargement…" : "Loading…"}</p> : null}
      {page ? (
        <div className="mt-6 space-y-8">
          <PayoutList
            title={fr ? "Comptes Connect" : "Connect accounts"}
            empty={page.accountsError || (fr ? "Aucun compte Connect enregistré." : "No Connect accounts are saved.")}
            rows={page.accounts.map((row) => ({
              id: row.daycareId,
              title: row.daycareName || row.daycareId,
              detail: [
                row.accountId || (fr ? "Pas d’identifiant" : "No account id"),
                `${fr ? "Charges" : "Charges"} ${yesNo(row.chargesEnabled, fr)}`,
                `${fr ? "Versements" : "Payouts"} ${yesNo(row.payoutsEnabled, fr)}`,
                `${fr ? "Dossier" : "Details"} ${yesNo(row.detailsSubmitted, fr)}`,
              ].join(" · "),
            }))}
          />
          <PayoutList
            title={fr ? "Versements" : "Payouts"}
            empty={page.payoutsError || (fr ? "Aucun versement enregistré." : "No payouts are saved.")}
            rows={page.payouts.map((row) => ({
              id: row.id,
              title: row.daycareName || row.period,
              detail: `${row.period} · ${row.status} · ${cad(row.net)} ${fr ? "net" : "net"}`,
            }))}
          />
          <PayoutList
            title={fr ? "Charges récentes" : "Recent charges"}
            empty={page.chargesError || (fr ? "Aucune charge enregistrée." : "No charges are saved.")}
            rows={page.charges.map((row) => ({
              id: row.id,
              title: row.daycareName || row.id,
              detail: [cad(row.amount), row.status, row.method, row.reference].filter(Boolean).join(" · "),
            }))}
          />
        </div>
      ) : null}
    </section>
  );
}

function PayoutList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: Array<{ id: string; title: string; detail: string }>;
}) {
  return (
    <div>
      <h3 className="font-display text-xl">{title}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="mt-3 divide-y divide-border overflow-hidden rounded-xl bg-surface ring-1 ring-border">
          {rows.map((row) => (
            <li key={row.id} className="min-w-0 px-4 py-3">
              <p className="font-medium">{row.title}</p>
              <p className="mt-1 text-sm text-muted">{row.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
