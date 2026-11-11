import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { securityPageFlag, createPrivacyRequest } from "@/lib/server/privacy-request";

const FACTS = {
  en: [
    "Sign-in uses a password that is stored as a hash, not as the password you typed.",
    "Pages are served over HTTPS.",
    "A daycare sees a child file only after the family enrolled or shared it.",
    "KidEase does not claim a security certification.",
  ],
  fr: [
    "La connexion garde un résumé du mot de passe, pas le mot de passe tapé.",
    "Les pages passent par HTTPS.",
    "Une garderie voit le dossier d'un enfant seulement après l'inscription ou un partage.",
    "KidEase ne revendique aucune certification de sécurité.",
  ],
};

/**
 * /security and /trust. Factual lines only when the flag is on.
 * When it is off, the page points at the privacy policy and does not make claims.
 */
export function SecurityPage({ locale }: { locale: "en" | "fr" }) {
  const fr = locale === "fr";
  const [on, setOn] = useState(false);
  const [privacyOn, setPrivacyOn] = useState(false);
  const [kind, setKind] = useState<"access" | "correction" | "deletion">("access");
  const [note, setNote] = useState("");
  const [caseId, setCaseId] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let live = true;
    void securityPageFlag()
      .then((flags) => {
        if (!live) return;
        setOn(flags.security);
        setPrivacyOn(flags.privacy);
      })
      .catch(() => {
        if (live) setOn(false);
      });
    return () => {
      live = false;
    };
  }, []);
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 pb-[env(safe-area-inset-bottom)]">
      <p className="text-sm font-semibold text-primary">KidEase</p>
      <h1 className="mt-2 font-display text-3xl">{fr ? "Sécurité" : "Security"}</h1>
      {on ? (
        <ul className="mt-4 list-disc space-y-2 pl-5 text-base text-fg">
          {FACTS[fr ? "fr" : "en"].map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-base text-muted">
          {fr ? "Cette page est fermée. La politique de confidentialité est ici." : "This page is closed. The privacy policy is here."}
        </p>
      )}
      <p className="mt-4">
        <Link to="/privacy" className="inline-flex min-h-11 items-center font-medium text-primary">
          {fr ? "Politique de confidentialité" : "Privacy policy"}
        </Link>
      </p>
      {privacyOn ? (
        <form
          className="mt-8 rounded-xl bg-surface p-4 shadow-card ring-1 ring-border"
          data-ke="privacy-request"
          onSubmit={(event) => {
            event.preventDefault();
            setMessage("");
            void createPrivacyRequest({ data: { kind, note } })
              .then((result) => {
                if (!result.ok) {
                  setMessage(fr ? "La demande n'a pas été ouverte." : "The request was not opened.");
                  return;
                }
                setCaseId(result.caseId);
              })
              .catch(() => setMessage(fr ? "La demande n'a pas été ouverte." : "The request was not opened."));
          }}
        >
          <h2 className="font-display text-xl">{fr ? "Demande de confidentialité" : "Privacy request"}</h2>
          <p className="mt-1 text-sm text-muted">
            {fr ? "Accès, correction ou suppression. Aucun courriel n'est envoyé." : "Access, correction, or deletion. No email is sent."}
          </p>
          <label className="mt-3 block text-sm font-medium">
            {fr ? "Type" : "Type"}
            <select className="ke-input mt-1 w-full" value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              <option value="access">{fr ? "Accès" : "Access"}</option>
              <option value="correction">{fr ? "Correction" : "Correction"}</option>
              <option value="deletion">{fr ? "Suppression" : "Deletion"}</option>
            </select>
          </label>
          <label className="mt-3 block text-sm font-medium">
            {fr ? "Note" : "Note"}
            <textarea className="ke-textarea mt-1 min-h-24 w-full" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          <Button type="submit" className="mt-3">
            {fr ? "Ouvrir la demande" : "Open the request"}
          </Button>
          {caseId ? <p className="mt-3 text-sm" data-ke="privacy-case">{caseId}</p> : null}
          {message ? <p className="mt-3 text-sm text-danger" role="alert">{message}</p> : null}
        </form>
      ) : null}
    </main>
  );
}
