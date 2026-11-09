import { useEffect, useState } from "react";
import { listMyCheckHistory } from "@/lib/server/child-checkin";
import { parentArrivalSentences } from "@/lib/parent-arrival";
import { useCopy } from "@/lib/use-copy";

/** Today's saved arrival or departure. Empty when nothing was recorded. */
export function ParentArrivalLine() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [lines, setLines] = useState<string[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let live = true;
    void listMyCheckHistory()
      .then((result) => {
        if (!live) return;
        setEnabled(result.enabled);
        setLines(result.enabled ? parentArrivalSentences(result.events, new Date(), fr ? "fr" : "en") : []);
      })
      .catch(() => {
        if (live) setLines([]);
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
  }, [fr]);

  return (
    <section className="mt-4 rounded-xl bg-surface px-5 py-4 ring-1 ring-border" data-ke="parent-arrival">
      <h2 className="font-display text-xl">{fr ? "Arrivée" : "Arrival"}</h2>
      {!ready ? <p className="mt-2 text-sm text-muted">{fr ? "Chargement…" : "Loading…"}</p> : null}
      {ready && !enabled ? (
        <p className="mt-2 text-sm text-muted">{fr ? "Les heures d'arrivée ne sont pas ouvertes." : "Arrival times are not turned on."}</p>
      ) : null}
      {ready && enabled && lines.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{fr ? "Aucune arrivée enregistrée aujourd'hui." : "No arrival saved today."}</p>
      ) : null}
      {lines.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
