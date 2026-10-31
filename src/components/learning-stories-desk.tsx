import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { storiesCopy } from "@/lib/learning-stories-copy";
import { LEARNING_FRAMEWORKS, type LearningFramework } from "@/lib/learning-stories";
import { listCentreStories, listParentStories, saveLearningStory, storiesStatus } from "@/lib/server/learning-stories";
import { useCopy } from "@/lib/use-copy";

export function StoriesDeskLink({ forParent = false }: { forParent?: boolean }) {
  const { locale } = useCopy();
  const copy = storiesCopy(locale);
  const [on, setOn] = useState(false);
  useEffect(() => {
    void storiesStatus().then((row) => setOn(row.enabled)).catch(() => setOn(false));
  }, []);
  if (!on) return null;
  if (forParent) {
    return (
      <p className="px-4 pt-4">
        <Link to="/parent" search={{ tab: "stories" }} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
          {copy.title}
        </Link>
      </p>
    );
  }
  return (
    <p className="mb-4">
      <Link to="/provider" search={{ desk: "stories" }} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
        {copy.title}
      </Link>
    </p>
  );
}

export function LearningStoriesDesk() {
  const { locale } = useCopy();
  const copy = storiesCopy(locale);
  const [desk, setDesk] = useState<Awaited<ReturnType<typeof listCentreStories>> | null>(null);
  const [daycareId, setDaycareId] = useState("");
  const [framework, setFramework] = useState<LearningFramework>("hdlh");
  const [form, setForm] = useState({ childId: "", domain: "belonging", observedOn: "", title: "", body: "" });
  const [busy, setBusy] = useState(false);

  function load(id = daycareId) {
    void listCentreStories({ data: { daycareId: id } }).then((row) => {
      setDesk(row);
      if (row.enabled && row.daycareId) setDaycareId(row.daycareId);
    }).catch(() => setDesk({ enabled: false, centres: [], children: [], stories: [] }));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!desk) return <p className="text-sm text-muted">{copy.lead}</p>;
  if (!desk.enabled) return <EmptyState title={copy.offTitle} body={copy.offBody} action={copy.home} actionTo="/provider" />;

  const domains = copy.domains[framework];
  const activeId = daycareId || desk.daycareId || "";

  return (
    <section className="space-y-8">
      <div>
        <h2 className="font-display text-2xl">{copy.title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">{copy.lead}</p>
        <p className="mt-1 text-sm text-muted">{copy.privateNote}</p>
      </div>
      {desk.centres.length > 1 ? (
        <label className="block text-sm">
          {copy.child}
          <select className="ke-input mt-1 min-h-11 w-full" value={activeId} onChange={(e) => { setDaycareId(e.target.value); load(e.target.value); }}>
            {desk.centres.map((centre) => <option key={centre.id} value={centre.id}>{centre.name}</option>)}
          </select>
        </label>
      ) : null}
      {desk.children.length === 0 ? <p className="text-sm text-muted">{copy.noChildren}</p> : (
        <form
          className="space-y-3 rounded-xl bg-surface p-4 ring-1 ring-border"
          onSubmit={(e) => {
            e.preventDefault();
            setBusy(true);
            void saveLearningStory({ data: { daycareId: activeId, framework, ...form } })
              .then(() => {
                toast.success(copy.saved);
                setForm({ childId: "", domain: domains[0]?.id || "", observedOn: "", title: "", body: "" });
                load(activeId);
              })
              .catch(() => toast.error(copy.bad))
              .finally(() => setBusy(false));
          }}
        >
          <label className="block text-sm">
            {copy.child}
            <select className="ke-input mt-1 min-h-11 w-full" value={form.childId} onChange={(e) => setForm({ ...form, childId: e.target.value })} required>
              <option value="">{copy.child}</option>
              {desk.children.map((child) => <option key={child.id} value={child.id}>{child.name}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              {copy.framework}
              <select className="ke-input mt-1 min-h-11 w-full" value={framework} onChange={(e) => {
                const next = e.target.value as LearningFramework;
                setFramework(next);
                setForm({ ...form, domain: copy.domains[next][0]?.id || "" });
              }}>
                {LEARNING_FRAMEWORKS.map((id) => <option key={id} value={id}>{copy.frameworks[id]}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              {copy.domain}
              <select className="ke-input mt-1 min-h-11 w-full" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })}>
                {domains.map((domain) => <option key={domain.id} value={domain.id}>{domain.label}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-sm">
            {copy.observed}
            <input type="date" className="ke-input mt-1 min-h-11 w-full" value={form.observedOn} onChange={(e) => setForm({ ...form, observedOn: e.target.value })} required />
          </label>
          <label className="block text-sm">
            {copy.storyTitle}
            <input className="ke-input mt-1 min-h-11 w-full" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          </label>
          <label className="block text-sm">
            {copy.body}
            <textarea className="ke-textarea mt-1 min-h-24 w-full" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required />
          </label>
          <Button type="submit" disabled={busy}>{copy.save}</Button>
        </form>
      )}
      {desk.stories.length === 0 ? <p className="text-sm text-muted">{copy.empty}</p> : (
        <ul className="space-y-3">
          {desk.stories.map((story) => (
            <li key={story.id} className="rounded-xl bg-surface p-4 ring-1 ring-border">
              <p className="font-medium">{story.title}</p>
              <p className="mt-1 text-sm text-muted">{story.observedOn} · {copy.frameworks[story.framework as LearningFramework] || story.framework}</p>
              <p className="mt-2 text-sm">{story.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ParentStoriesDesk() {
  const { locale } = useCopy();
  const copy = storiesCopy(locale);
  const [rows, setRows] = useState<Awaited<ReturnType<typeof listParentStories>> | null>(null);
  useEffect(() => {
    void listParentStories().then(setRows).catch(() => setRows({ enabled: false, stories: [] }));
  }, []);
  if (!rows) return <p className="text-sm text-muted">{copy.parentLead}</p>;
  if (!rows.enabled) return <EmptyState title={copy.offTitle} body={copy.offBody} action={copy.home} actionTo="/parent" />;
  return (
    <section className="space-y-4">
      <h1 className="font-display text-3xl">{copy.title}</h1>
      <p className="max-w-2xl text-sm text-muted">{copy.parentLead}</p>
      <p className="text-sm text-muted">{copy.privateNote}</p>
      {rows.stories.length === 0 ? <p className="text-sm text-muted">{copy.empty}</p> : (
        <ul className="space-y-3">
          {rows.stories.map((story) => (
            <li key={story.id} className="rounded-xl bg-surface p-4 ring-1 ring-border">
              <p className="text-sm text-muted">{story.childName} · {story.observedOn}</p>
              <p className="mt-1 font-medium">{story.title}</p>
              <p className="mt-2 text-sm">{story.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
