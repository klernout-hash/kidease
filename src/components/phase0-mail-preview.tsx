import { useEffect, useState } from "react";
import { useCopy } from "@/lib/use-copy";
import { familyEmailSubject } from "@/lib/phase0-desk";
import { loadDeskFeatureFlags } from "@/lib/server/desk-features";
import { tourNextStepLetter } from "@/lib/tour-phase0";

function heldLine(locale: string, rest: string) {
  const held = locale === "fr" ? "Pas encore envoyé." : "Not sent yet.";
  return `${held} ${rest}`;
}

/**
 * Previews for the held Phase 0 notes. Nothing on this page sends mail.
 */
export function TourFollowupPreview({ centreName }: { centreName: string }) {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [on, setOn] = useState(false);
  useEffect(() => {
    void loadDeskFeatureFlags()
      .then((flags) => setOn(flags.postTourFollowup))
      .catch(() => setOn(false));
  }, []);
  if (!on) return null;
  const centre = centreName.trim() || (fr ? "Votre centre" : "Your centre");
  const letter = tourNextStepLetter({ locale: fr ? "fr" : "en", centre, applyPath: "/parent?tab=enrolled" });
  return (
    <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="tour-followup-preview">
      <h2 className="font-display text-xl">{fr ? "Après la visite" : "After the visit"}</h2>
      <p className="mt-1 text-sm text-muted">
        {fr
          ? "Aperçu de la note qu’une famille reçoit environ un jour après une visite terminée. Cette page ne l’envoie pas."
          : "Preview of the one note a family gets about a day after a completed tour. This page does not send it."}
      </p>
      <p className="mt-3 text-sm font-medium">{letter.subject}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm">{letter.text}</p>
      <p className="mt-3 text-xs text-subtle">
        {heldLine(locale, fr ? "Une visite terminée est requise avant que la tâche puisse partir." : "A completed tour is required before the job can run.")}
      </p>
    </section>
  );
}

export function FormSharePreview() {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [on, setOn] = useState(false);
  const [note, setNote] = useState(fr ? "Veuillez remplir le formulaire d’inscription." : "Please fill in the enrolment form.");
  useEffect(() => {
    void loadDeskFeatureFlags()
      .then((flags) => setOn(flags.enrolmentEsign))
      .catch(() => setOn(false));
  }, []);
  if (!on) return null;
  return (
    <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="form-share-preview">
      <h2 className="font-display text-xl">{fr ? "Partager un formulaire" : "Share a form"}</h2>
      <p className="mt-1 text-sm text-muted">
        {fr
          ? "Une note qui accompagne un formulaire. Plusieurs notes en dix minutes restent un seul message. Rien n’est envoyé depuis cette page."
          : "A note that goes with a form. Several notes in ten minutes stay one message. Nothing is sent from this page."}
      </p>
      <label className="mt-3 block text-sm font-medium" htmlFor="form-share-note">
        {fr ? "Note pour la famille" : "Note for the family"}
      </label>
      <textarea
        id="form-share-note"
        className="ke-textarea mt-1 min-h-24 w-full"
        value={note}
        onChange={(event) => setNote(event.target.value.slice(0, 500))}
        onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
      />
      <p className="mt-3 text-sm font-medium">{fr ? "Aperçu" : "Preview"}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{note.trim() || (fr ? "Ajoutez une courte note." : "Add a short note.")}</p>
      <p className="mt-3 text-xs text-subtle">
        {heldLine(
          locale,
          fr
            ? "Ouvrez une conversation sur Messages si vous voulez la famille devant vous."
            : "Open a parent thread on Messages if you need the family in front of you.",
        )}
      </p>
    </section>
  );
}

export function FamilyEmailPreview({ centreName }: { centreName: string }) {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const [on, setOn] = useState(false);
  const [body, setBody] = useState(fr ? "Nous sommes fermés demain." : "We are closed tomorrow.");
  useEffect(() => {
    void loadDeskFeatureFlags()
      .then((flags) => setOn(flags.familyBulkMail))
      .catch(() => setOn(false));
  }, []);
  if (!on) return null;
  const centre = centreName.trim() || (fr ? "Votre centre" : "Your centre");
  return (
    <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="family-email-preview">
      <h2 className="font-display text-xl">{fr ? "Écrire aux familles" : "Email families"}</h2>
      <p className="mt-1 text-sm text-muted">
        {fr
          ? "Une note aux familles de ce centre. L’expéditeur reste sur kidease.ca. Cette page ne l’envoie pas."
          : "One note to the families at this centre. The sender stays on kidease.ca. This page does not send it."}
      </p>
      <label className="mt-3 block text-sm font-medium" htmlFor="family-email-body">
        {fr ? "Message" : "Message"}
      </label>
      <textarea
        id="family-email-body"
        className="ke-textarea mt-1 min-h-24 w-full"
        value={body}
        onChange={(event) => setBody(event.target.value.slice(0, 500))}
        onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
      />
      <p className="mt-3 text-sm font-medium">{familyEmailSubject(fr ? "fr" : "en", centre)}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{body.trim() || (fr ? "Écrivez la note." : "Write the note.")}</p>
      <p className="mt-3 text-xs text-subtle">
        {heldLine(locale, fr ? "Il faut au moins une famille déjà liée à ce centre." : "Needs at least one family already linked to this centre.")}
      </p>
    </section>
  );
}
