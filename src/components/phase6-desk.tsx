import { useEffect, useState } from "react";
import { CRA_CHILD_CARE_URL, CUSTODY_GUIDANCE, custodyVisible } from "@/lib/phase6-rules";
import { phase6Flags } from "@/lib/server/phase6-flags";

type Flags = Awaited<ReturnType<typeof phase6Flags>>;
const EMPTY: Flags = { custody: false, packs: false, extra: false, payer: false };

/** Staff alert at checkout. Hidden while the custody flag is off. */
export function CustodyCheckoutAlert({ locale }: { locale: "en" | "fr" }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    void phase6Flags()
      .then((flags) => {
        if (live) setOn(flags.custody);
      })
      .catch(() => {
        if (live) setOn(false);
      });
    return () => {
      live = false;
    };
  }, []);
  if (!on) return null;
  const fr = locale === "fr";
  return (
    <p className="mt-2 text-sm text-danger" data-ke="custody-checkout" role="status">
      {fr ? CUSTODY_GUIDANCE.fr : CUSTODY_GUIDANCE.en}
    </p>
  );
}

/** Hidden until a Phase 6 flag is on. Nothing here sends or charges. */
export function Phase6Desk({ locale, role }: { locale: "en" | "fr"; role: string | null }) {
  const [flags, setFlags] = useState<Flags>(EMPTY);
  const fr = locale === "fr";
  useEffect(() => {
    let live = true;
    void phase6Flags()
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
  if (!Object.values(flags).some(Boolean)) return null;
  return (
    <div className="mt-6 space-y-4" data-ke="phase6-desk">
      {flags.custody && custodyVisible({ role, centreStaff: role === "owner" || role === "manager" || role === "staff" }) ? (
        <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="custody-order">
          <h2 className="font-display text-xl">{fr ? "Ordonnance" : "Court order"}</h2>
          <p className="mt-1 text-sm text-muted">{fr ? CUSTODY_GUIDANCE.fr : CUSTODY_GUIDANCE.en}</p>
          <p className="mt-2 text-sm text-muted">
            {fr
              ? "Les deux parents gardent l'accès. On ne peut pas cacher un parent sans une ordonnance au dossier."
              : "Both parents keep access. A parent cannot be hidden unless an order is on file."}
          </p>
        </section>
      ) : null}
      {flags.packs && role !== "parent" && role !== "billing" ? (
        <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="operator-packs">
          <h2 className="font-display text-xl">{fr ? "Rapports" : "Reports"}</h2>
          <p className="mt-1 text-sm text-muted">
            {fr
              ? "Brouillons seulement. Le titulaire les dépose. KidEase ne garde aucun mot de passe gouvernemental."
              : "Drafts only. The licensee submits them. KidEase does not store a government password."}
          </p>
        </section>
      ) : null}
      {flags.extra ? (
        <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="extra-day">
          <h2 className="font-display text-xl">{fr ? "Journée d'échange" : "Exchange day"}</h2>
          <p className="mt-1 text-sm text-muted">
            {fr
              ? "On échange d'abord une journée déjà payée, sans frais ajouté. Une salle pleine est refusée. Aucun frais n'est chargé."
              : "Swap an already paid day first, with no added fee. A full room is refused. No charge is made."}
          </p>
        </section>
      ) : null}
      {flags.payer ? (
        <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="third-party-payer">
          <h2 className="font-display text-xl">{fr ? "Autre payeur" : "Another payer"}</h2>
          <p className="mt-1 text-sm text-muted">
            {fr
              ? "Le reçu va à la personne qui a payé. La famille ne paie pas plus que le tarif permis."
              : "The receipt goes to whoever paid. The family is not charged above the lawful fee."}
          </p>
          <a className="mt-2 inline-flex min-h-11 items-center text-primary" href={CRA_CHILD_CARE_URL}>
            {fr ? "Page de l'ARC" : "CRA page"}
          </a>
        </section>
      ) : null}
    </div>
  );
}
