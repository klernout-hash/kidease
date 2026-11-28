import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { localePath } from "@/lib/locale-path";

/**
 * Shown instead of checkout inside a store build (N-09).
 * No checkout and no link out to one: the app shows bills and their PDFs only.
 * One clear next step (Bills) and a way to reach the centre, so it is never a dead end.
 */
export function NativePayNote({ locale }: { locale?: string }) {
  const fr = locale === "fr";
  const lang = fr ? "fr" : "en";
  return (
    <section className="mx-auto max-w-lg px-4 py-8" data-ke="native-pay-note">
      <h1 className="font-display text-3xl">{fr ? "Vos factures" : "Your bills"}</h1>
      <p className="mt-2 text-sm text-muted">
        {fr
          ? "Dans l’appli, vous pouvez voir chaque facture et enregistrer son PDF. Une question? Écrivez à votre garderie."
          : "In the app, you can see each bill and save its PDF. Questions? Message your daycare."}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button asChild>
          <Link to={fr ? "/fr/invoices" : "/invoices"} data-ke="native-pay-bills">
            {fr ? "Voir mes factures" : "See my bills"}
          </Link>
        </Button>
        <Link to={localePath("/inbox", lang)} className="inline-flex min-h-11 items-center font-medium text-primary">
          Messages
        </Link>
      </div>
    </section>
  );
}
