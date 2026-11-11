import { useEffect, useState } from "react";
import { familyEmailSubject, planFamilyEmail, planFormShareEmail } from "@/lib/phase0-desk";
import { loadDeskFeatureFlags } from "@/lib/server/desk-features";
import { planTourFollowup, tourNextStepLetter } from "@/lib/tour-phase0";

/**
 * Previews for the held Phase 0 notes. Nothing on this page sends mail.
 */
export function TourFollowupPreview({ centreName }: { centreName: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    void loadDeskFeatureFlags()
      .then((flags) => setOn(flags.postTourFollowup))
      .catch(() => setOn(false));
  }, []);
  if (!on) return null;
  const centre = centreName.trim() || "Your centre";
  const letter = tourNextStepLetter({ locale: "en", centre, applyPath: "/parent?tab=enrolled" });
  const plan = planTourFollowup({
    flagOn: true,
    tourAt: null,
    enabledAt: null,
    now: new Date(),
    timeZone: "America/Winnipeg",
    cancelled: false,
    applied: false,
    waitlisted: false,
    alreadySent: false,
  });
  return (
    <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="tour-followup-preview">
      <h2 className="font-display text-xl">After the visit</h2>
      <p className="mt-1 text-sm text-muted">
        Preview of the one note a family gets about a day after a completed tour. This page does not send it.
      </p>
      <p className="mt-3 text-sm font-medium">{letter.subject}</p>
      <p className="mt-2 whitespace-pre-wrap text-sm">{letter.text}</p>
      <p className="mt-3 text-xs text-subtle">Held here ({plan.reason}). A completed tour is required before the job can run.</p>
    </section>
  );
}

export function FormSharePreview() {
  const [on, setOn] = useState(false);
  const [note, setNote] = useState("Please fill in the enrolment form.");
  useEffect(() => {
    void loadDeskFeatureFlags()
      .then((flags) => setOn(flags.enrolmentEsign))
      .catch(() => setOn(false));
  }, []);
  if (!on) return null;
  const plan = planFormShareEmail({
    flagOn: true,
    shares: [{ id: "preview", at: new Date().toISOString(), locale: "en" }],
    alreadySentIds: [],
    nowMs: Date.now(),
  });
  return (
    <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="form-share-preview">
      <h2 className="font-display text-xl">Share a form</h2>
      <p className="mt-1 text-sm text-muted">
        A note that goes with a form. Several notes in ten minutes stay one message. Nothing is sent from this page.
      </p>
      <label className="mt-3 block text-sm font-medium" htmlFor="form-share-note">
        Note for the family
      </label>
      <textarea
        id="form-share-note"
        className="mt-1 min-h-24 w-full rounded-xl bg-bg px-3 py-2 text-sm ring-1 ring-border"
        value={note}
        onChange={(event) => setNote(event.target.value.slice(0, 500))}
        onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
      />
      <p className="mt-3 text-sm font-medium">Preview</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{note.trim() || "Add a short note."}</p>
      <p className="mt-3 text-xs text-subtle">Held ({plan.reason}). Open a parent thread on Messages if you need the family in front of you.</p>
    </section>
  );
}

export function FamilyEmailPreview({ centreName }: { centreName: string }) {
  const [on, setOn] = useState(false);
  const [body, setBody] = useState("We are closed tomorrow.");
  useEffect(() => {
    void loadDeskFeatureFlags()
      .then((flags) => setOn(flags.familyBulkMail))
      .catch(() => setOn(false));
  }, []);
  if (!on) return null;
  const centre = centreName.trim() || "Your centre";
  const plan = planFamilyEmail({
    flagOn: true,
    messageId: "preview",
    sender: "kyle@kidease.ca",
    locale: "en",
    alreadySent: false,
    suppressed: "none",
  });
  return (
    <section className="rounded-xl bg-surface p-4 shadow-card ring-1 ring-border" data-ke="family-email-preview">
      <h2 className="font-display text-xl">Email families</h2>
      <p className="mt-1 text-sm text-muted">
        One note to the families at this centre. The sender stays on kidease.ca. This page does not send it.
      </p>
      <label className="mt-3 block text-sm font-medium" htmlFor="family-email-body">
        Message
      </label>
      <textarea
        id="family-email-body"
        className="mt-1 min-h-24 w-full rounded-xl bg-bg px-3 py-2 text-sm ring-1 ring-border"
        value={body}
        onChange={(event) => setBody(event.target.value.slice(0, 500))}
        onFocus={(event) => event.currentTarget.scrollIntoView({ block: "center" })}
      />
      <p className="mt-3 text-sm font-medium">{familyEmailSubject("en", centre)}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{body.trim() || "Write the note."}</p>
      <p className="mt-3 text-xs text-subtle">Held ({plan.reason}). Needs at least one family already linked to this centre.</p>
    </section>
  );
}
