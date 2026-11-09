import { useEffect, useState } from "react";
import { listCertExpiry } from "@/lib/server/cert-expiry";
import { useCopy } from "@/lib/use-copy";

/** Certificate dates for this centre. Alerts stay unsent. */
export function CertExpiryPanel() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [rows, setRows] = useState<Array<{ staffName: string; centre: string; expiresOn: string }>>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void listCertExpiry()
      .then((result) => {
        if (live) setRows(result.rows);
      })
      .catch(() => {
        if (live) setRows([]);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <section className="rounded-xl bg-surface px-5 py-6 ring-1 ring-border" data-ke="cert-expiry">
      <h2 className="font-display text-xl">{fr ? "Certificats du personnel" : "Staff certificates"}</h2>
      <p className="mt-2 text-sm">
        {fr
          ? "Les dates des 60 prochains jours seulement. Une date déjà passée n'est pas reprise. La personne doit accepter l'alerte."
          : "Only dates in the next 60 days. A date that already passed is not replayed. The person has to agree to the alert."}
      </p>
      <p className="mt-2 text-sm font-medium" data-ke="cert-expiry-unsent">
        {fr ? "Rien n'est envoyé depuis cette page." : "Nothing is sent from this page."}
      </p>
      {!ready ? <p className="mt-3 text-sm text-muted">{fr ? "Chargement…" : "Loading…"}</p> : null}
      {ready && rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{fr ? "Aucun certificat à venir." : "No upcoming certificates."}</p>
      ) : null}
      {rows.length ? (
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map((row) => (
            <li key={`${row.staffName}-${row.expiresOn}`}>
              {row.staffName} · {row.centre} · {row.expiresOn}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
