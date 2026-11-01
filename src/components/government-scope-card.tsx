import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { loadGovScope } from "@/lib/server/gov-scopes";
import { useCopy } from "@/lib/use-copy";
import { useInNativeShell } from "@/lib/use-native-shell";

type Scope = Awaited<ReturnType<typeof loadGovScope>>;

export function GovernmentScopeCard() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const native = useInNativeShell();
  const [data, setData] = useState<Scope | null>(null);

  useEffect(() => {
    let cancel = false;
    void loadGovScope()
      .then((next) => {
        if (!cancel) setData(next);
      })
      .catch(() => {
        if (!cancel) setData(null);
      });
    return () => {
      cancel = true;
    };
  }, []);

  if (!data?.show) return null;

  const home = fr ? "Aller à l’accueil" : "Go home";

  if (native) {
    return (
      <section className="mb-6 rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="gov-scope">
        <h2 className="font-display text-2xl">{fr ? "Totaux provinciaux" : "Provincial totals"}</h2>
        <p className="mt-2 text-sm text-muted">
          {fr
            ? "Les totaux du gouvernement restent sur le site web. Cette appli ne vous déconnecte pas."
            : "Government totals stay on the website. This app does not sign you out."}
        </p>
        <Link to="/" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary">
          {home}
        </Link>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="gov-scope">
      <p className="text-sm font-semibold text-primary">{fr ? "Gouvernement" : "Government"}</p>
      <h2 className="mt-1 font-display text-2xl">{fr ? "Totaux de votre province" : "Your province totals"}</h2>
      {data.reason === "off" ? (
        <p className="mt-2 text-sm text-muted">
          {fr ? "Les totaux provinciaux ne sont pas encore offerts." : "Provincial totals are not on yet."}
        </p>
      ) : null}
      {data.reason === "missing" ? (
        <p className="mt-2 text-sm text-muted">
          {fr
            ? "Demandez à KidEase d’ajouter votre province. Aucun autre chiffre n’est affiché."
            : "Ask KidEase to add your province. No other numbers are shown."}
        </p>
      ) : null}
      {data.reason === "ok" ? (
        <>
          <p className="mt-2 text-sm text-muted">
            {fr
              ? `Seulement ${data.province}. Les noms, les rues et les enfants restent cachés.`
              : `Only ${data.province}. Names, streets, and children stay hidden.`}
          </p>
          <p className="mt-3 font-medium">
            {fr ? "Centres enregistrés" : "Saved centres"}: {data.centres}
          </p>
          <p className="font-medium">
            {fr ? "Places ouvertes enregistrées" : "Saved open spots"}: {data.openSpots}
          </p>
        </>
      ) : null}
      <Link to="/" className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary">
        {home}
      </Link>
    </section>
  );
}
