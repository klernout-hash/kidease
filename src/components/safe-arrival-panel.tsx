import { useCopy } from "@/lib/use-copy";

/** Safe arrival stays on the daycare desk. Nothing is sent from this screen. */
export function SafeArrivalPanel() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  return (
    <section className="rounded-xl bg-surface px-5 py-6 ring-1 ring-border" data-ke="safe-arrival">
      <h2 className="font-display text-xl">{fr ? "Arrivée sûre" : "Safe arrival"}</h2>
      <p className="mt-2 text-sm">
        {fr
          ? "Un enfant qui n'est pas enregistré, et dont la famille n'a pas dit qu'il serait absent, est une absence sans avis. Un enfant encore ici après l'heure de départ est un départ en retard."
          : "A child who is not checked in, and whose family did not say they would be away, is absent without notice. A child still here after pickup time is a late pickup."}
      </p>
      <p className="mt-2 text-sm">
        {fr
          ? "La famille doit accepter d'abord. Seule la journée d'aujourd'hui compte. Les jours passés ne sont pas repris."
          : "The family has to agree first. Only today counts. Past days are not replayed."}
      </p>
      <p className="mt-2 text-sm font-medium" data-ke="safe-arrival-unsent">
        {fr ? "Rien n'est envoyé depuis cette page." : "Nothing is sent from this page."}
      </p>
    </section>
  );
}
