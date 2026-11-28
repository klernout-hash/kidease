import { createFileRoute, Link } from "@tanstack/react-router";
import { Shell } from "@/components/shell";
import { autopayEnabled, instalmentsEnabled, savedPaymentsEnabled, splitInstalments } from "@/lib/invoice-money";
import { formatCad } from "@/lib/cad-format";
import { useCopy } from "@/lib/use-copy";

export const Route = createFileRoute("/pay-plan")({
  head: () => ({
    meta: [
      { title: "Invoice tools · KidEase" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PayPlanPage,
});

function PayPlanPage() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const saved = savedPaymentsEnabled();
  const autopay = autopayEnabled();
  const instalments = instalmentsEnabled();
  const sample = instalments ? splitInstalments(10000, 3) : null;
  const cad = (cents: number) => formatCad(cents / 100, fr ? "fr-CA" : "en-CA");
  return (
    <Shell>
      <main className="ke-gutter mx-auto w-full max-w-lg py-12">
        <p className="text-sm font-semibold text-primary">KidEase</p>
        <h1 className="mt-2 font-display text-3xl">{fr ? "Outils de facture" : "Invoice tools"}</h1>
        <p className="mt-4 text-muted">
          {fr
            ? "Une carte enregistrée, un paiement automatique, ou des versements sur une facture de garderie. Pas d’abonnement KidEase."
            : "A saved card, autopay, or instalments on a daycare invoice. No KidEase subscription."}
        </p>
        <ul className="mt-6 space-y-3 text-sm">
          <li>{saved ? (fr ? "Cartes enregistrées : ouvert." : "Saved cards: on.") : fr ? "Cartes enregistrées : éteint." : "Saved cards: off."}</li>
          <li>{autopay ? (fr ? "Paiement automatique : ouvert. Aucun débit tant qu’une facture n’est pas due." : "Autopay: on. No charge until an invoice is due.") : fr ? "Paiement automatique : éteint." : "Autopay: off."}</li>
          <li>
            {sample
              ? fr
                ? `Exemple de ${cad(10000)} en 3 versements : ${sample.map(cad).join(", ")}. Sans intérêt.`
                : `Example of ${cad(10000)} in 3 parts: ${sample.map(cad).join(", ")}. No interest.`
              : fr
                ? "Versements : éteint."
                : "Instalments: off."}
          </li>
        </ul>
        <p className="mt-8">
          <Link to="/parent" className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
            {fr ? "Retour au compte parent" : "Back to the parent account"}
          </Link>
        </p>
      </main>
    </Shell>
  );
}
