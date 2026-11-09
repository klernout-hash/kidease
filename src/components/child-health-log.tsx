import { useEffect, useState } from "react";
import { listChildHealthLog } from "@/lib/server/child-health-log";
import { useCopy } from "@/lib/use-copy";

type HealthRow = {
  id: string;
  name: string;
  immunizationStatus: string;
  immunizationNote: string;
  allergies: string;
  medications: string;
};

/** Saved notes only. A public page never mounts this. */
export function ChildHealthLog() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void listChildHealthLog()
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
    <section className="rounded-xl bg-surface px-5 py-6 ring-1 ring-border" data-ke="child-health-log">
      <h2 className="font-display text-xl">{fr ? "Santé de l'enfant" : "Child health"}</h2>
      <p className="mt-2 text-sm">
        {fr
          ? "Vaccins, allergies et médicaments déjà enregistrés. Un parent voit ses enfants. Le centre voit seulement les enfants inscrits. Rien n'est inventé."
          : "Immunization, allergies, and medications already saved. A parent sees their own children. The centre sees enrolled children only. Nothing is invented."}
      </p>
      {!ready ? <p className="mt-3 text-sm text-muted">{fr ? "Chargement…" : "Loading…"}</p> : null}
      {ready && rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{fr ? "Rien d'enregistré." : "Nothing saved."}</p>
      ) : null}
      <ul className="mt-3 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="text-sm">
            <p className="font-medium">{row.name}</p>
            <p>{fr ? "Vaccins" : "Immunization"}: {row.immunizationStatus || (fr ? "Rien d'enregistré." : "Nothing saved.")}</p>
            {row.immunizationNote ? <p>{row.immunizationNote}</p> : null}
            <p>{fr ? "Allergies" : "Allergies"}: {row.allergies || (fr ? "Rien d'enregistré." : "Nothing saved.")}</p>
            <p>{fr ? "Médicaments" : "Medications"}: {row.medications || (fr ? "Rien d'enregistré." : "Nothing saved.")}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
