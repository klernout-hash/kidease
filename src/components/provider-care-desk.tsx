import { lazy, Suspense, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { CareFloorDesk } from "@/components/care-floor-desk";
import { Phase1Desk } from "@/components/phase1-desk";
import { KioskTablet } from "@/components/qr-kiosk-panel";
import { listProviderFamilyDocs } from "@/lib/server/provider-care";
import { useCopy } from "@/lib/use-copy";

const DailyCareDesk = lazy(() => import("@/components/daily-care-desk").then((m) => ({ default: m.DailyCareDesk })));

/**
 * Care tools whose flags are on. Each card is a way in. Nothing here sends mail.
 */
export function ProviderCareDesk({ daycareId, owner }: { daycareId?: string; owner: boolean }) {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const role = owner ? "owner" : "staff";
  const [docs, setDocs] = useState<Awaited<ReturnType<typeof listProviderFamilyDocs>> | null>(null);

  useEffect(() => {
    let live = true;
    void listProviderFamilyDocs()
      .then((next) => {
        if (live) setDocs(next);
      })
      .catch(() => {
        if (live) setDocs({ enabled: false, documents: [] });
      });
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="mt-4 space-y-6" data-ke="provider-care-desk">
      <div>
        <h2 className="font-display text-2xl">{fr ? "Soins au centre" : "Care at the centre"}</h2>
        <p className="mt-1 max-w-prose text-sm text-muted">
          {fr
            ? "Ces outils s’affichent quand leur interrupteur est ouvert. Rien n’est envoyé d’ici."
            : "These tools show when their switch is on. Nothing is sent from here."}
        </p>
      </div>
      {daycareId ? <KioskTablet daycareId={daycareId} /> : null}
      <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="provider-fire-kiosk">
        <h3 className="font-display text-xl">{fr ? "Tablette Fire" : "Fire tablet"}</h3>
        <p className="mt-1 text-sm text-muted">
          {fr
          ? "L'écran d'arrivée s'ouvre ici dans le navigateur. La tablette Fire garde son propre écran."
          : "The check-in screen opens here in the browser. A Fire tablet keeps its own screen."}
        </p>
        <Link
          to={fr ? "/fr/kiosk" : "/kiosk"}
          className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {fr ? "Ouvrir l’écran d’arrivée" : "Open the check-in screen"}
        </Link>
      </section>
      <Phase1Desk locale={fr ? "fr" : "en"} role={role} omit={["roll", "toilet", "pickup", "allergy", "incident"]} />
      {daycareId ? <CareFloorDesk daycareId={daycareId} /> : null}
      <Suspense fallback={<div className="ke-skel h-40 rounded-xl" aria-hidden="true" />}>
        <DailyCareDesk role="provider" daycareId={daycareId} />
      </Suspense>
      {docs?.enabled ? (
        <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="provider-family-vault">
          <h3 className="font-display text-xl">{fr ? "Dossier familial" : "Family files"}</h3>
          <p className="mt-1 text-sm text-muted">
            {fr
              ? "Les familles gardent leurs fichiers. Vous voyez seulement ceux qu’elles ont partagés avec votre centre."
              : "Families keep their own files. You only see files they have shared with your centre."}
          </p>
          {docs.documents.length ? (
            <ul className="mt-3 divide-y divide-border text-sm">
              {docs.documents.map((doc) => (
                <li key={doc.shareId} className="py-2">
                  <span className="font-medium">{doc.fileName}</span>
                  <span className="text-muted"> · {doc.daycareName}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">{fr ? "Aucun fichier partagé." : "No shared files yet."}</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
