import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { loadAiSuiteGate, type AiSuiteGate } from "@/lib/server/ai-suite";
import {
  dailyUpdateDraft,
  leadScore,
  phoneReceptionScript,
  postDraft,
  reviewRequestDraft,
  smartStaffingNote,
  tourFollowUpDraft,
  waitlistFillDraft,
  type AiSuiteFlag,
} from "@/lib/ai/suite";
import { useCopy } from "@/lib/use-copy";

const COPY = {
  en: {
    title: "Draft helpers",
    lead: "These notes stay on this screen. KidEase does not send them, post them, or place a call.",
    make: "Make a draft",
    missing: "Fill in the details above and try again.",
    missingVisit: "Confirm that the family visited.",
    missingSpots: "Enter at least one posted open spot.",
    bands: { new: "New", talking: "In touch", visited: "Visited", enrolled: "Enrolled" },
    tour: "Tour follow-up",
    phone: "Phone script",
    score: "Family step",
    wait: "Waitlist note",
    post: "Post draft",
    daily: "Daily note",
    review: "Review note",
    staff: "Room count",
    centre: "Centre name",
    parent: "Parent first name",
    child: "Child first name",
    visited: "They already visited",
    hours: "Posted hours",
    messages: "Messages",
    tours: "Tours",
    enrolled: "Enrolled",
    spots: "Open spots you posted",
    family: "Next family on your list",
    fact: "One fact you want to say",
    note: "What happened today",
    room: "Room",
    children: "Children",
    educators: "Educators",
  },
  fr: {
    title: "Brouillons",
    lead: "Ces notes restent sur cet écran. KidEase ne les envoie pas, ne les publie pas et ne passe pas d’appel.",
    make: "Faire un brouillon",
    missing: "Remplissez les champs ci-dessus, puis réessayez.",
    missingVisit: "Confirmez que la famille a fait une visite.",
    missingSpots: "Entrez au moins une place libre affichée.",
    bands: { new: "Nouvelle famille", talking: "En contact", visited: "Visite effectuée", enrolled: "Inscription terminée" },
    tour: "Suivi de visite",
    phone: "Texte pour le téléphone",
    score: "Étape de la famille",
    wait: "Note de liste d’attente",
    post: "Brouillon de publication",
    daily: "Note du jour",
    review: "Note d’avis",
    staff: "Compte de la salle",
    centre: "Nom du centre",
    parent: "Prénom du parent",
    child: "Prénom de l’enfant",
    visited: "La visite a déjà eu lieu",
    hours: "Heures affichées",
    messages: "Messages",
    tours: "Visites",
    enrolled: "Inscrit",
    spots: "Places affichées",
    family: "Prochaine famille sur votre liste",
    fact: "Un fait que vous voulez dire",
    note: "Ce qui s’est passé aujourd’hui",
    room: "Salle",
    children: "Enfants",
    educators: "Éducateurs",
  },
} as const;

export function AiSuitePanel() {
  const { locale } = useCopy();
  const copy = locale === "fr" ? COPY.fr : COPY.en;
  const [gate, setGate] = useState<AiSuiteGate | null>(null);

  useEffect(() => {
    let live = true;
    void loadAiSuiteGate()
      .then((next) => {
        if (live) setGate(next);
      })
      .catch(() => {
        if (live) setGate({ any: false, flags: emptyFlags() });
      });
    return () => {
      live = false;
    };
  }, []);

  if (!gate?.any) return null;
  const on = (key: AiSuiteFlag) => gate.flags[key] === true;
  const lang = locale === "fr" ? "fr" : "en";

  return (
    <section className="mt-6 rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="ai-suite">
      <h2 className="font-display text-xl">{copy.title}</h2>
      <p className="mt-2 max-w-prose text-sm leading-6 text-muted">{copy.lead}</p>
      <div className="mt-4 grid gap-4">
        {on("FEATURE_AI_TOUR_FOLLOWUP") ? (
          <DraftForm
            title={copy.tour}
            fields={[
              ["centre", copy.centre],
              ["parent", copy.parent],
            ]}
            check={["visited", copy.visited, copy.missingVisit]}
            action={copy.make}
            missing={copy.missing}
            onSubmit={(values) => {
              const result = tourFollowUpDraft({
                enabled: true,
                locale: lang,
                centre: values.centre || "",
                parentName: values.parent || "",
                visited: values.visited === "1",
              });
              return result.body;
            }}
          />
        ) : null}
        {on("FEATURE_AI_PHONE_RECEPTION") ? (
          <DraftForm
            title={copy.phone}
            fields={[
              ["centre", copy.centre],
              ["hours", copy.hours],
            ]}
            action={copy.make}
            missing={copy.missing}
            onSubmit={(values) => {
              const result = phoneReceptionScript({
                enabled: true,
                locale: lang,
                centre: values.centre || "",
                hours: values.hours || "",
              });
              return result.script;
            }}
          />
        ) : null}
        {on("FEATURE_AI_LEAD_SCORE") ? (
          <DraftForm
            title={copy.score}
            fields={[
              ["messages", copy.messages],
              ["tours", copy.tours],
            ]}
            check={["enrolled", copy.enrolled]}
            action={copy.make}
            missing={copy.missing}
            onSubmit={(values) => {
              const result = leadScore({
                enabled: true,
                messages: Number(values.messages) || 0,
                tours: Number(values.tours) || 0,
                enrolled: values.enrolled === "1",
              });
              return result.band ? copy.bands[result.band] : "";
            }}
          />
        ) : null}
        {on("FEATURE_AI_WAITLIST_FILL") ? (
          <DraftForm
            title={copy.wait}
            fields={[
              ["centre", copy.centre],
              ["spots", copy.spots],
              ["family", copy.family],
            ]}
            action={copy.make}
            missing={copy.missing}
            validate={(values) => Number(values.spots) >= 1 ? "" : copy.missingSpots}
            onSubmit={(values) => {
              const result = waitlistFillDraft({
                enabled: true,
                locale: lang,
                centre: values.centre || "",
                openSpots: Number(values.spots) || 0,
                nextFamily: values.family || "",
              });
              return result.body;
            }}
          />
        ) : null}
        {on("FEATURE_AI_POST_WRITER") ? (
          <DraftForm
            title={copy.post}
            fields={[
              ["centre", copy.centre],
              ["fact", copy.fact],
            ]}
            action={copy.make}
            missing={copy.missing}
            onSubmit={(values) => {
              const result = postDraft({ enabled: true, locale: lang, centre: values.centre || "", fact: values.fact || "" });
              return result.body;
            }}
          />
        ) : null}
        {on("FEATURE_AI_DAILY_UPDATE") ? (
          <DraftForm
            title={copy.daily}
            fields={[
              ["child", copy.child],
              ["note", copy.note],
            ]}
            action={copy.make}
            missing={copy.missing}
            onSubmit={(values) => {
              const result = dailyUpdateDraft({ enabled: true, locale: lang, childName: values.child || "", note: values.note || "" });
              return result.body;
            }}
          />
        ) : null}
        {on("FEATURE_AI_REVIEW_REQUEST") ? (
          <DraftForm
            title={copy.review}
            fields={[
              ["centre", copy.centre],
              ["parent", copy.parent],
            ]}
            check={["visited", copy.visited, copy.missingVisit]}
            action={copy.make}
            missing={copy.missing}
            onSubmit={(values) => {
              const result = reviewRequestDraft({
                enabled: true,
                locale: lang,
                centre: values.centre || "",
                parentName: values.parent || "",
                visited: values.visited === "1",
              });
              return result.body;
            }}
          />
        ) : null}
        {on("FEATURE_AI_SMART_STAFFING") ? (
          <DraftForm
            title={copy.staff}
            fields={[
              ["room", copy.room],
              ["children", copy.children],
              ["educators", copy.educators],
            ]}
            action={copy.make}
            missing={copy.missing}
            onSubmit={(values) => {
              const result = smartStaffingNote({
                enabled: true,
                locale: lang,
                room: values.room || "",
                children: Number(values.children) || 0,
                educators: Number(values.educators) || 0,
              });
              return result.body;
            }}
          />
        ) : null}
      </div>
    </section>
  );
}

function emptyFlags(): AiSuiteGate["flags"] {
  return {
    FEATURE_AI_TOUR_FOLLOWUP: false,
    FEATURE_AI_PHONE_RECEPTION: false,
    FEATURE_AI_LEAD_SCORE: false,
    FEATURE_AI_WAITLIST_FILL: false,
    FEATURE_AI_POST_WRITER: false,
    FEATURE_AI_DAILY_UPDATE: false,
    FEATURE_AI_REVIEW_REQUEST: false,
    FEATURE_AI_SMART_STAFFING: false,
  };
}

function DraftForm({
  title,
  fields,
  check,
  action,
  missing,
  validate,
  onSubmit,
}: {
  title: string;
  fields: Array<[string, string]>;
  check?: [string, string] | [string, string, string];
  action: string;
  missing: string;
  validate?: (values: Record<string, string>) => string;
  onSubmit: (values: Record<string, string>) => string;
}) {
  const [feedback, setFeedback] = useState({ text: "", error: false });
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const values: Record<string, string> = {};
        for (const [key] of fields) values[key] = String(data.get(key) || "").trim();
        if (check) values[check[0]] = data.get(check[0]) ? "1" : "";
        const problem = (check?.[2] && !values[check[0]] ? check[2] : "") || validate?.(values);
        const draft = problem ? "" : onSubmit(values);
        setFeedback({ text: draft || problem || missing, error: !draft });
      }}
    >
      <h3 className="text-sm font-semibold">{title}</h3>
      {fields.map(([key, label]) => (
        <label key={key} className="block text-sm">
          {label}
          <input name={key} className="mt-1 block min-h-11 w-full rounded-lg bg-bg px-3 ring-1 ring-border" />
        </label>
      ))}
      {check ? (
        <label className="inline-flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" name={check[0]} />
          {check[1]}
        </label>
      ) : null}
      <Button type="submit" className="w-fit">
        {action}
      </Button>
      <div className="max-w-prose text-sm leading-6" role="status" aria-atomic="true">
        {feedback.text ? (
          <p className={feedback.error ? "text-danger" : undefined} data-ke={feedback.error ? "ai-suite-validation" : "ai-suite-draft"}>
            {feedback.text}
          </p>
        ) : null}
      </div>
    </form>
  );
}
