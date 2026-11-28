import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { listChildHealthLog, readAdminChildHealth } from "@/lib/server/child-health-log";
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
export function ChildHealthLog({ admin = false }: { admin?: boolean }) {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [rows, setRows] = useState<HealthRow[]>([]);
  const [ready, setReady] = useState(admin);
  const [childId, setChildId] = useState("");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (admin) return;
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
  }, [admin]);

  return (
    <section className="min-h-44 rounded-xl bg-surface px-5 py-6 ring-1 ring-border" data-ke="child-health-log">
      <h2 className="font-display text-xl">{fr ? "Santé de l'enfant" : "Child health"}</h2>
      {admin ? (
        <form className="mt-2 space-y-2" onSubmit={async (event) => {
          event.preventDefault();
          if (!childId.trim() || !ready) return;
          setReady(false);
          setRows([]);
          setFailed(false);
          try {
            const record = await readAdminChildHealth({ data: { childId } });
            setRows(record ? [record] : []);
          } catch {
            setFailed(true);
          } finally {
            setReady(true);
          }
        }}>
          <label className="block text-sm font-medium">
            {fr ? "Identifiant de l’enfant" : "Child ID"}
            <input className="mt-1 block min-h-11 w-full max-w-sm rounded-lg border border-border bg-surface px-3" value={childId} maxLength={128} required disabled={!ready} onChange={(event) => { setChildId(event.target.value); setRows([]); setFailed(false); }} />
          </label>
          <Button type="submit" disabled={!ready || !childId.trim()}>{fr ? "Ouvrir le dossier" : "Open record"}</Button>
        </form>
      ) : <p className="mt-2 text-sm">
        {fr
          ? "Vaccins, allergies et médicaments déjà enregistrés. Un parent voit ses enfants. Le centre voit seulement les enfants inscrits. Rien n'est inventé."
          : "Immunization, allergies, and medications already saved. A parent sees their own children. The centre sees enrolled children only. Nothing is invented."}
      </p>}
      {failed ? <p role="alert">{fr ? "Impossible d’ouvrir le dossier. Réessayez." : "Could not open the record. Try again."}</p> : null}
      {!ready ? <p className="mt-3 text-sm text-muted">{fr ? "Chargement…" : "Loading…"}</p> : null}
      {ready && !failed && rows.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{fr ? "Rien d'enregistré." : "Nothing saved."}</p>
      ) : null}
      <ul className="mt-3 space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="text-sm">
            <p className="font-medium">{row.name}</p>
            <p>{fr ? "Vaccins\u00a0:" : "Immunization:"} {row.immunizationStatus || (fr ? "Rien d'enregistré." : "Nothing saved.")}</p>
            {row.immunizationNote ? <p>{row.immunizationNote}</p> : null}
            <p>{fr ? "Allergies\u00a0:" : "Allergies:"} {row.allergies || (fr ? "Rien d'enregistré." : "Nothing saved.")}</p>
            <p>{fr ? "Médicaments\u00a0:" : "Medications:"} {row.medications || (fr ? "Rien d'enregistré." : "Nothing saved.")}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
