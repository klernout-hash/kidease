import { Link } from "@tanstack/react-router";

/** Shown instead of checkout inside the native shell. No link to pay on the website. */
export function NativePayNote({ locale }: { locale?: string }) {
  const fr = locale === "fr";
  return (
    <section className="mx-auto max-w-lg px-4 py-8" data-ke="native-pay-note">
      <h1 className="font-display text-3xl">
        {fr ? "Les paiements ne font pas partie de cette appli." : "Payments are not part of this app."}
      </h1>
      <p className="mt-2 text-sm text-muted">
        {fr
          ? "Cherchez une garderie permise, ou ouvrez Messages."
          : "Search for a licensed daycare, or open Messages."}
      </p>
      <p className="mt-4 flex flex-wrap gap-3">
        <Link to="/search" className="inline-flex min-h-11 items-center font-medium text-primary">
          {fr ? "Chercher" : "Search"}
        </Link>
        <Link to="/inbox" className="inline-flex min-h-11 items-center font-medium text-primary">
          Messages
        </Link>
      </p>
    </section>
  );
}
