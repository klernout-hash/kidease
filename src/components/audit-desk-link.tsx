import { useEffect, useState } from "react";
import { securityPageFlag } from "@/lib/server/privacy-request";

/** Audit log link. Hidden while FEATURE_AUDIT_LOG is off. */
export function AuditDeskLink({ locale }: { locale: "en" | "fr" }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    void securityPageFlag()
      .then((flags) => {
        if (live) setOn(flags.audit);
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
    <section className="mt-6 rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="audit-log-link">
      <h2 className="font-display text-xl">{fr ? "Journal d'audit" : "Audit log"}</h2>
      <p className="mt-1 text-sm text-muted">
        {fr ? "Les propriétaires voient seulement leurs centres. Rien n'est envoyé." : "Owners see only their centres. Nothing is sent."}
      </p>
    </section>
  );
}
