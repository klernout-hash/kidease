import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { planLanguage, type AgeBand } from "@/lib/curriculum/pack";
import {
  attachCurriculumPhoto,
  curriculumCoverage,
  curriculumStatus,
  grantCurriculumPhotoConsent,
  listCurriculumTimeline,
  listStoryCorner,
  loadCurriculumDesk,
  openStoryCornerFile,
  replyToCurriculumStory,
  governmentCurriculumTotals,
  saveCurriculumPlan,
  saveCurriculumStory,
} from "@/lib/server/curriculum-pack";
import { useCopy } from "@/lib/use-copy";

type Section = "goals" | "story" | "plans" | "activities" | "coverage" | "books";

const COPY = {
  en: {
    help: "Help",
    offTitle: "Learning pack is off",
    offBody: "Goals, stories, and plans stay hidden until this tool is turned on. Your listing is unchanged.",
    home: "Back to today",
    title: "Learning",
    lead: "KidEase is a place to plan play and share a story with families.",
    why: "The goals follow your centre's province. The words are ours. The official framework stays on the government site.",
    next: "Pick one goal, then write what you noticed.",
    provinceMissing: "Add your province on the listing. Then the right goals show up here.",
    listings: "Edit listing",
    goals: "Goals",
    story: "Story",
    plans: "Plans",
    activities: "Activities",
    coverage: "Coverage",
    books: "Story corner",
    saveStory: "Save story",
    savePlan: "Save plan",
    child: "Child",
    note: "What you noticed",
    nextStep: "What to try next",
    date: "Date",
    age: "Age group",
    goal: "Goal",
    noChild: "No enrolled child is on file yet.",
    saved: "Saved.",
    draftNote: "Families will see this when the live switch is on. Until then it stays a draft.",
    photo: "Add a photo",
    photoHint: "A parent must opt in first. The photo is private. It is not on the public listing.",
    consent: "I agree to private classroom photos",
    activitiesLead: "These ideas were written by KidEase. They are not copied from a framework or a bought program.",
    coverageLead: "Published stories only. Names stay on this desk.",
    booksOff: "Story corner is off.",
    booksEmpty: "No books are stored on this server yet. Nothing is loaded from another site.",
    read: "Read the saved copy",
    unite: "Open Unite for Literacy",
    uniteNote: "This leaves KidEase. We do not embed their books.",
    reply: "Send a reply",
    parentTitle: "Stories from the centre",
    parentLead: "A note about your child, plus an idea to try at home.",
    parentOff: "Stories show here when your centre publishes them.",
    govTitle: "Learning totals",
    govBody: "Counts only. No child names, no photos, no room names.",
    hidden: "Hidden",
    preview: "Preview only. This is not sent anywhere.",
  },
  fr: {
    help: "Aide",
    offTitle: "Le volet apprentissage est éteint",
    offBody: "Les objectifs, les histoires et les plans restent cachés tant que l'outil est éteint. Votre fiche ne change pas.",
    home: "Retour à aujourd'hui",
    title: "Apprentissage",
    lead: "KidEase sert à planifier le jeu et à partager une histoire avec les familles.",
    why: "Les objectifs suivent la province de votre centre. Les mots sont les nôtres. Le cadre officiel reste sur le site du gouvernement.",
    next: "Choisissez un objectif, puis écrivez ce que vous avez vu.",
    provinceMissing: "Ajoutez votre province sur la fiche. Les bons objectifs s'afficheront ici.",
    listings: "Modifier la fiche",
    goals: "Objectifs",
    story: "Histoire",
    plans: "Plans",
    activities: "Activités",
    coverage: "Couverture",
    books: "Coin des histoires",
    saveStory: "Enregistrer",
    savePlan: "Enregistrer le plan",
    child: "Enfant",
    note: "Ce que vous avez vu",
    nextStep: "Quoi essayer ensuite",
    date: "Date",
    age: "Groupe d'âge",
    goal: "Objectif",
    noChild: "Aucun enfant inscrit n'est au dossier.",
    saved: "Enregistré.",
    draftNote: "Les familles verront ceci quand l'interrupteur en direct sera ouvert. D'ici là, cela reste un brouillon.",
    photo: "Ajouter une photo",
    photoHint: "Un parent doit d'abord dire oui. La photo reste privée. Elle n'est pas sur la fiche publique.",
    consent: "J'accepte les photos privées de la classe",
    activitiesLead: "Ces idées sont écrites par KidEase. Elles ne sont pas copiées d'un cadre ni d'un programme acheté.",
    coverageLead: "Histoires publiées seulement. Les noms restent sur ce bureau.",
    booksOff: "Le coin des histoires est éteint.",
    booksEmpty: "Aucun livre n'est enregistré sur ce serveur. Rien n'est chargé d'un autre site.",
    read: "Lire la copie enregistrée",
    unite: "Ouvrir Unite for Literacy",
    uniteNote: "Cela quitte KidEase. Nous n'intégrons pas leurs livres.",
    reply: "Envoyer une réponse",
    parentTitle: "Histoires du centre",
    parentLead: "Une note sur votre enfant, plus une idée à essayer à la maison.",
    parentOff: "Les histoires s'affichent ici quand votre centre les publie.",
    govTitle: "Totaux d'apprentissage",
    govBody: "Des comptes seulement. Aucun nom d'enfant, aucune photo, aucun nom de salle.",
    hidden: "Masqué",
    preview: "Aperçu seulement. Rien n'est envoyé.",
  },
} as const;

function HelpLink({ label, topic }: { label: string; topic: string }) {
  return (
    <a
      href={`/help#${topic}`}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-4 text-sm font-medium ring-1 ring-border touch-manipulation"
      data-ke="curriculum-help"
      data-topic={topic}
    >
      {label}
    </a>
  );
}

function text(locale: string) {
  return locale === "fr" ? COPY.fr : COPY.en;
}

export function CurriculumDeskLink() {
  const { locale } = useCopy();
  const copy = text(locale);
  const [on, setOn] = useState(false);
  useEffect(() => {
    void curriculumStatus()
      .then((row) => setOn(row.pack))
      .catch(() => setOn(false));
  }, []);
  if (!on) return null;
  return (
    <p className="mb-4">
      <Link to="/provider" search={{ desk: "learning" }} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
        {copy.title}
      </Link>
    </p>
  );
}

export function CurriculumPackDesk() {
  const { locale } = useCopy();
  const copy = text(locale);
  const [section, setSection] = useState<Section>("goals");
  const [desk, setDesk] = useState<Awaited<ReturnType<typeof loadCurriculumDesk>> | null>(null);
  const [daycareId, setDaycareId] = useState("");
  const [form, setForm] = useState({ childId: "", goalId: "", title: "", body: "", whatNext: "", observedOn: "", ageBand: "preschool" as AgeBand });
  const [answers, setAnswers] = useState<string[]>(["", "", "", ""]);
  const [busy, setBusy] = useState(false);
  const [coverage, setCoverage] = useState<Awaited<ReturnType<typeof curriculumCoverage>> | null>(null);
  const [books, setBooks] = useState<Awaited<ReturnType<typeof listStoryCorner>> | null>(null);

  function load(id = daycareId) {
    void loadCurriculumDesk({ data: { daycareId: id } })
      .then((row) => {
        setDesk(row);
        if (row.enabled && row.daycareId) setDaycareId(row.daycareId);
      })
      .catch(() => setDesk({ enabled: false, flags: { pack: false, live: false, stories: false, mode: "off" } }));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!desk) return <p className="text-sm text-muted">{copy.lead}</p>;
  if (!desk.enabled) {
    return (
      <section data-section="off">
        <HelpLink label={copy.help} topic="learning-off" />
        <EmptyState title={copy.offTitle} body={copy.offBody} action={copy.home} actionTo="/provider" />
      </section>
    );
  }

  const province = desk.province;
  const lang = province ? planLanguage(province, locale) : locale === "fr" ? "fr" : "en";
  const showFr = lang === "fr" || lang === "both";
  const showEn = lang === "en" || lang === "both";
  const sections: Section[] = ["goals", "story", "plans", "activities", "coverage", "books"];

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl">{copy.title}</h2>
          <p className="mt-2 max-w-2xl text-sm">{copy.lead}</p>
          <p className="mt-1 max-w-2xl text-sm text-muted">{copy.why}</p>
          <p className="mt-1 max-w-2xl text-sm text-muted">{copy.next}</p>
          {desk.flags.mode !== "live" ? <p className="mt-2 text-sm text-muted">{copy.draftNote}</p> : null}
        </div>
        <HelpLink label={copy.help} topic={`learning-${section}`} />
      </div>
      {desk.centres.length > 1 ? (
        <label className="block text-sm">
          {copy.title}
          <select
            className="ke-input mt-1 min-h-11 w-full"
            value={daycareId || desk.daycareId}
            onChange={(event) => {
              setDaycareId(event.target.value);
              load(event.target.value);
            }}
          >
            {desk.centres.map((centre) => (
              <option key={centre.id} value={centre.id}>
                {centre.name}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {!province || !desk.framework ? (
        <EmptyState title={copy.provinceMissing} action={copy.listings} actionTo="/provider?desk=listings" />
      ) : (
        <>
          <p className="text-sm">
            <a className="font-medium underline-offset-4 hover:underline" href={desk.framework.url}>
              {desk.framework.name}
            </a>
            <span className="text-muted"> · {desk.framework.credit}</span>
          </p>
          <p className="text-sm text-muted">
            {desk.framework.requirementStatus === "confirmed" ? desk.framework.requirement : `${desk.framework.requirement} (${desk.framework.requirementStatus})`}
          </p>
          <div className="flex flex-wrap gap-2" role="tablist">
            {sections.map((id) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={section === id}
                className="inline-flex min-h-11 items-center rounded-full px-4 text-sm ring-1 ring-border touch-manipulation"
                onClick={() => {
                  setSection(id);
                  if (id === "coverage") void curriculumCoverage({ data: { daycareId: daycareId || desk.daycareId } }).then(setCoverage);
                  if (id === "books") void listStoryCorner({ data: { province, language: locale === "fr" ? "fr" : "en" } }).then(setBooks);
                }}
              >
                {copy[id]}
              </button>
            ))}
          </div>
          {section === "goals" ? (
            <ul className="space-y-3" data-section="goals">
              {desk.goals.map((goal) => (
                <li key={goal.id} className="rounded-xl bg-surface p-4 ring-1 ring-border">
                  {showEn ? <p>{goal.en}</p> : null}
                  {showFr ? <p>{goal.fr}</p> : null}
                  <p className="mt-1 text-sm text-muted">{goal.credit}</p>
                </li>
              ))}
            </ul>
          ) : null}
          {section === "story" ? (
            <form
              className="space-y-3"
              data-section="story"
              onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                void saveCurriculumStory({
                  data: { daycareId: daycareId || desk.daycareId, ...form, publish: true },
                })
                  .then(() => {
                    toast.success(copy.saved);
                    load(daycareId || desk.daycareId);
                  })
                  .catch((error: unknown) => toast.error(error instanceof Error ? error.message : copy.offTitle))
                  .finally(() => setBusy(false));
              }}
            >
              {desk.children.length === 0 ? <p className="text-sm text-muted">{copy.noChild}</p> : null}
              <label className="block text-sm">
                {copy.child}
                <select className="ke-input mt-1 min-h-11 w-full" required value={form.childId} onChange={(event) => setForm({ ...form, childId: event.target.value })}>
                  <option value="">{copy.child}</option>
                  {desk.children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                {copy.goal}
                <select className="ke-input mt-1 min-h-11 w-full" required value={form.goalId} onChange={(event) => setForm({ ...form, goalId: event.target.value })}>
                  <option value="">{copy.goal}</option>
                  {desk.goals.map((goal) => (
                    <option key={goal.id} value={goal.id}>
                      {showFr && !showEn ? goal.fr : goal.en}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                {copy.age}
                <select className="ke-input mt-1 min-h-11 w-full" value={form.ageBand} onChange={(event) => setForm({ ...form, ageBand: event.target.value as AgeBand })}>
                  {(["infant", "toddler", "preschool", "school"] as const).map((age) => (
                    <option key={age} value={age}>
                      {age}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                {copy.date}
                <input type="date" required className="ke-input mt-1 min-h-11 w-full" value={form.observedOn} onChange={(event) => setForm({ ...form, observedOn: event.target.value })} />
              </label>
              <label className="block text-sm">
                {copy.note}
                <textarea required className="ke-textarea mt-1 min-h-24 w-full" value={form.body} onChange={(event) => setForm({ ...form, title: event.target.value.slice(0, 80), body: event.target.value })} />
              </label>
              <label className="block text-sm">
                {copy.nextStep}
                <textarea className="ke-textarea mt-1 min-h-20 w-full" value={form.whatNext} onChange={(event) => setForm({ ...form, whatNext: event.target.value })} />
              </label>
              {desk.stories[0] ? <p className="text-sm text-muted">{copy.photoHint}</p> : null}
              <Button type="submit" disabled={busy}>
                {copy.saveStory}
              </Button>
              {desk.stories[0] ? (
              <label className="block text-sm">
                {copy.photo}
                <input
                  className="mt-1 block min-h-11 w-full"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    const story = desk.stories[0];
                    const child = desk.children.find((row) => row.id === form.childId);
                    if (!file || !story || !child?.bookingId) return;
                    const reader = new FileReader();
                    reader.onload = () => {
                      const bodyBase64 = String(reader.result || "");
                      void attachCurriculumPhoto({
                        data: {
                          daycareId: daycareId || desk.daycareId,
                          storyId: story.id,
                          bookingId: child.bookingId,
                          contentType: file.type,
                          bodyBase64,
                        },
                      }).catch((error: unknown) => toast.error(error instanceof Error ? error.message : copy.photoHint));
                    };
                    reader.readAsDataURL(file);
                  }}
                />
              </label>
              ) : null}
            </form>
          ) : null}
          {section === "plans" ? (
            <form
              className="space-y-3"
              data-section="plans"
              onSubmit={(event) => {
                event.preventDefault();
                setBusy(true);
                const today = new Date().toISOString().slice(0, 10);
                void saveCurriculumPlan({
                  data: { daycareId: daycareId || desk.daycareId, kind: "statement", periodStart: today, answers },
                })
                  .then(() => {
                    toast.success(copy.saved);
                    load(daycareId || desk.daycareId);
                  })
                  .catch((error: unknown) => toast.error(error instanceof Error ? error.message : copy.offTitle))
                  .finally(() => setBusy(false));
              }}
            >
              {desk.docs.map((doc) => (
                <div key={doc.id} className="space-y-3">
                  <h3 className="font-medium">{showFr && !showEn ? doc.titleFr : doc.titleEn}</h3>
                  <p className="text-sm text-muted">{doc.citation}</p>
                  {(showFr && !showEn ? doc.promptsFr : doc.promptsEn).map((prompt, index) => (
                    <label key={prompt} className="block text-sm">
                      {prompt}
                      {lang === "both" ? <span className="mt-1 block text-muted">{doc.promptsFr[index]}</span> : null}
                      <textarea
                        className="ke-textarea mt-1 min-h-20 w-full"
                        value={answers[index] || ""}
                        onChange={(event) => {
                          const next = [...answers];
                          next[index] = event.target.value;
                          setAnswers(next);
                        }}
                      />
                    </label>
                  ))}
                </div>
              ))}
              <Button type="submit" disabled={busy}>
                {copy.savePlan}
              </Button>
              <ul className="space-y-2 text-sm">
                {desk.plans.map((plan) => (
                  <li key={plan.id} className="rounded-xl bg-surface p-3 ring-1 ring-border">
                    {plan.kind} · {plan.period_start}
                    {plan.review_due_on ? ` · ${plan.review_due_on}` : ""}
                  </li>
                ))}
              </ul>
            </form>
          ) : null}
          {section === "activities" ? (
            <ul className="space-y-3" data-section="activities">
              <li className="text-sm text-muted">{copy.activitiesLead}</li>
              {desk.activities.map((activity) => (
                <li key={activity.id} className="rounded-xl bg-surface p-4 ring-1 ring-border">
                  {showEn ? <p className="font-medium">{activity.titleEn}</p> : null}
                  {showFr ? <p className="font-medium">{activity.titleFr}</p> : null}
                  <p className="mt-1 text-sm text-muted">{activity.age}</p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                    {(showFr && !showEn ? activity.stepsFr : activity.stepsEn).map((step) => (
                      <li key={step}>{step}</li>
                    ))}
                  </ol>
                </li>
              ))}
            </ul>
          ) : null}
          {section === "coverage" ? (
            <div data-section="coverage" className="space-y-3">
              <p className="text-sm text-muted">{copy.coverageLead}</p>
              {coverage && coverage.enabled && coverage.report
                ? coverage.report.perChild.map((child) => (
                    <article key={child.childId} className="rounded-xl bg-surface p-4 ring-1 ring-border">
                      <h3 className="font-medium">
                        {child.childName} · {child.room}
                      </h3>
                      <p className="text-sm text-muted">
                        {child.covered.length} / {child.covered.length + child.missing.length}
                      </p>
                    </article>
                  ))
                : null}
            </div>
          ) : null}
          {section === "books" ? (
            <div data-section="books" className="space-y-4">
              <HelpLink label={copy.help} topic="story-corner" />
              {!books?.enabled ? <p className="text-sm">{copy.booksOff}</p> : null}
              {books?.enabled && books.books.length === 0 ? <p className="text-sm text-muted">{copy.booksEmpty}</p> : null}
              <ul className="space-y-4">
                {books?.enabled
                  ? books.books.map((book) => (
                      <li key={book.id} className="rounded-xl bg-surface p-4 ring-1 ring-border">
                        <h3 className="font-medium">{book.title}</h3>
                        {book.logoPath ? (
                          <img src={book.logoPath} alt="Book Dash" width={150} height={67} className="mt-2 h-auto max-w-full" />
                        ) : null}
                        <p className="mt-2 text-sm">{book.credit}</p>
                        {book.changeNote ? <p className="mt-1 text-sm">{book.changeNote}</p> : null}
                        <a className="mt-2 inline-flex min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline" href={book.licenceUrl}>
                          {book.licenceUrl}
                        </a>
                        <div>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => {
                              void openStoryCornerFile({ data: { id: book.id } }).then((file) => {
                                if (!file.ok) {
                                  toast.error(copy.booksEmpty);
                                  return;
                                }
                                const binary = atob(file.bodyBase64);
                                const bytes = new Uint8Array(binary.length);
                                for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
                                const blob = new Blob([bytes], { type: file.mime });
                                window.open(URL.createObjectURL(blob), "_blank", "noopener");
                              });
                            }}
                          >
                            {copy.read}
                          </Button>
                        </div>
                      </li>
                    ))
                  : null}
              </ul>
              {books ? (
                <p className="text-sm">
                  {copy.uniteNote}{" "}
                  <a className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline" href={books.unite.href} target="_blank" rel="noreferrer">
                    {copy.unite}
                  </a>
                </p>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

export function CurriculumParentDesk() {
  const { locale } = useCopy();
  const copy = text(locale);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listCurriculumTimeline>> | null>(null);
  const [reply, setReply] = useState("");
  useEffect(() => {
    void listCurriculumTimeline().then(setRows).catch(() => setRows({ enabled: false, live: false, stories: [], bookingId: "" }));
  }, []);
  if (!rows) return <p className="text-sm text-muted">{copy.parentLead}</p>;
  if (!rows.enabled) {
    return (
      <section data-section="parent-off">
        <HelpLink label={copy.help} topic="learning-parent" />
        <EmptyState title={copy.offTitle} body={copy.offBody} action={copy.home} actionTo="/parent" />
      </section>
    );
  }
  return (
    <section className="space-y-4" data-section="parent-stories">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">{copy.parentTitle}</h1>
          <p className="mt-2 max-w-2xl text-sm">{copy.parentLead}</p>
          {!rows.live ? <p className="mt-2 text-sm text-muted">{copy.parentOff}</p> : null}
        </div>
        <HelpLink label={copy.help} topic="learning-parent" />
      </div>
      {rows.bookingId ? (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            void grantCurriculumPhotoConsent({ data: { bookingId: rows.bookingId } })
              .then(() => toast.success(copy.saved))
              .catch(() => toast.error(copy.photoHint));
          }}
        >
          <p className="text-sm text-muted">{copy.photoHint}</p>
          <Button type="submit" variant="secondary">
            {copy.consent}
          </Button>
        </form>
      ) : (
        <p className="text-sm text-muted">{copy.photoHint}</p>
      )}
      <ul className="space-y-4">
        {rows.stories.map((story) => (
          <li key={story.id} className="rounded-xl bg-surface p-4 ring-1 ring-border">
            <p className="text-sm text-muted">
              {story.childName} · {story.observedOn}
            </p>
            <h2 className="font-medium">{story.title}</h2>
            <p className="mt-2 text-sm">{story.body}</p>
            {story.whatNext ? <p className="mt-2 text-sm">{story.whatNext}</p> : null}
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
              {story.ideas.map((idea) => (
                <li key={idea.id}>{locale === "fr" ? idea.titleFr : idea.titleEn}</li>
              ))}
            </ul>
            <form
              className="mt-3 space-y-2"
              onSubmit={(event) => {
                event.preventDefault();
                void replyToCurriculumStory({ data: { storyId: story.id, body: reply } })
                  .then(() => {
                    setReply("");
                    toast.success(copy.saved);
                  })
                  .catch((error: unknown) => toast.error(error instanceof Error ? error.message : copy.parentOff));
              }}
            >
              <label className="block text-sm">
                {copy.reply}
                <textarea className="ke-textarea mt-1 min-h-20 w-full" value={reply} onChange={(event) => setReply(event.target.value)} />
              </label>
              <Button type="submit">{copy.reply}</Button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CurriculumGovStrip({ province }: { province: string }) {
  const { locale } = useCopy();
  const copy = text(locale);
  const [row, setRow] = useState<Awaited<ReturnType<typeof governmentCurriculumTotals>> | null>(null);
  useEffect(() => {
    void governmentCurriculumTotals({ data: { province } })
      .then(setRow)
      .catch(() => setRow(null));
  }, [province]);
  if (!row?.enabled) return null;
  return (
    <section className="mt-8" data-section="gov-learning" aria-labelledby="gov-learning-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="gov-learning-title" className="font-display text-xl">
            {copy.govTitle}
          </h2>
          <p className="mt-2 text-sm text-muted">{copy.govBody}</p>
          {row.preview ? <p className="mt-1 text-sm text-muted">{copy.preview}</p> : null}
        </div>
        <HelpLink label={copy.help} topic="learning-gov" />
      </div>
      <p className="mt-3 text-sm">
        {row.childCount == null ? copy.hidden : row.childCount}
      </p>
      <ul className="mt-2 space-y-1 text-sm">
        {row.goals.map((goal) => (
          <li key={goal.goalId}>
            {goal.label || goal.goalId}: {goal.children == null ? copy.hidden : goal.children}
          </li>
        ))}
      </ul>
    </section>
  );
}
