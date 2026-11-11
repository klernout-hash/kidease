import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { STAFF_MOBILE_COPY, staffMobileOpen } from "@/lib/phase2-rules";
import { phase2DeskFlags } from "@/lib/server/phase2-flags";

type Flags = Awaited<ReturnType<typeof phase2DeskFlags>>;

const EMPTY: Flags = {
  reviews: false,
  pdf: false,
  packet: false,
  mobile: false,
  reminder: false,
  lateFee: false,
  tax: false,
  cwelcc: false,
  video: false,
  milestones: false,
  renewal: false,
};

/**
 * Phase 2 desks. Hidden while every flag is off. Nothing here sends or charges.
 */
export function Phase2Desk({ locale, role }: { locale: "en" | "fr"; role: string | null }) {
  const [flags, setFlags] = useState<Flags>(EMPTY);
  const fr = locale === "fr";
  useEffect(() => {
    let live = true;
    void phase2DeskFlags()
      .then((next) => {
        if (live) setFlags(next);
      })
      .catch(() => {
        if (live) setFlags(EMPTY);
      });
    return () => {
      live = false;
    };
  }, []);
  const any = Object.values(flags).some(Boolean);
  if (!any) return null;
  return (
    <div className="mt-6 space-y-4" data-ke="phase2-desk">
      {flags.reviews ? (
        <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border">
          <h2 className="font-display text-xl">{fr ? "Réponse à un avis" : "Reply to a review"}</h2>
          <p className="mt-1 text-sm text-muted">{fr ? "Une seule réponse, après une relecture. Rien n'est publié ici." : "One reply, after a person checks it. Nothing is published from this card."}</p>
        </section>
      ) : null}
      {flags.pdf || flags.packet ? (
        <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border">
          <h2 className="font-display text-xl">{fr ? "Dossier d'admission" : "Admission packet"}</h2>
          <p className="mt-1 text-sm text-muted">{fr ? "Les champs requis restent sur cette page. Aucun fichier n'est envoyé." : "Required fields stay on this page. No file is sent."}</p>
        </section>
      ) : null}
      {flags.mobile && staffMobileOpen(role) ? (
        <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="staff-mobile">
          <h2 className="font-display text-xl">{fr ? "Téléphone du personnel" : "Staff phone"}</h2>
          <p className="mt-1 text-sm text-muted">{STAFF_MOBILE_COPY[fr ? "fr" : "en"]}</p>
        </section>
      ) : null}
      {flags.reminder || flags.lateFee || flags.tax || flags.cwelcc ? (
        <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border">
          <h2 className="font-display text-xl">{fr ? "Frais" : "Fees"}</h2>
          <p className="mt-1 text-sm text-muted">
            {fr ? "Les rappels ne partent pas. Aucun frais n'est chargé. Un tarif officiel manquant reste caché." : "Reminders are not sent. No fee is charged. A missing official rate stays hidden."}
          </p>
          <Button type="button" className="mt-3" disabled>
            {fr ? "Rien à envoyer" : "Nothing to send"}
          </Button>
        </section>
      ) : null}
      {flags.video ? (
        <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border">
          <h2 className="font-display text-xl">{fr ? "Vidéo" : "Video"}</h2>
          <p className="mt-1 text-sm text-muted">{fr ? "L'écran est prêt. Aucune vidéo n'est téléversée." : "The screen is ready. No video is uploaded."}</p>
        </section>
      ) : null}
      {flags.milestones ? (
        <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border">
          <h2 className="font-display text-xl">{fr ? "Étapes" : "Milestones"}</h2>
          <p className="mt-1 text-sm text-muted">{fr ? "Seules les étapes notées par le centre apparaissent." : "Only milestones the centre wrote down appear."}</p>
        </section>
      ) : null}
      {flags.renewal ? (
        <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border">
          <h2 className="font-display text-xl">{fr ? "Renouvellement" : "Renewal"}</h2>
          <p className="mt-1 text-sm text-muted">{fr ? "Le statut est ici. Aucun rappel n'est envoyé." : "The status is here. No reminder is sent."}</p>
        </section>
      ) : null}
    </div>
  );
}
