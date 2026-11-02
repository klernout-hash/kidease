import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { EceJobApply } from "@/components/ece-job-board";
import { gapCopy, jobDeskPowers, type JobDesk } from "@/lib/gap-features";
import { localePath } from "@/lib/locale-path";
import {
  eceJobsFlag,
  listJobShortage,
  listManagedEceJobs,
  listMyCentresForJobs,
  listPublicEceJobs,
  postEceJob,
  setEceApplicationStatus,
  setEceJobStatus,
} from "@/lib/server/ece-jobs";
import { useCopy } from "@/lib/use-copy";

type Post = { id: string; role: string; note: string; status: "open" | "closed"; daycareId: string; name: string; city: string };
type Applicant = { id: string; jobId: string; role: string; name: string; email: string; note: string; status: string; centre: string };
type PublicJob = { id: string; role: string; note: string; name: string; slug: string; city: string };

function fieldClass() {
  return "mt-1 block w-full min-h-11 rounded-lg bg-surface px-3 ring-1 ring-border";
}

export function EceJobDesk({ mode }: { mode: Exclude<JobDesk, "public" | "gov"> }) {
  const { locale } = useCopy();
  const copy = gapCopy(locale === "fr" ? "fr" : "en");
  const powers = jobDeskPowers(mode);
  const [on, setOn] = useState(false);
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [centres, setCentres] = useState<{ id: string; name: string }[]>([]);
  const [daycareId, setDaycareId] = useState("");
  const [role, setRole] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  function load() {
    if (powers.manage) {
      return Promise.all([listManagedEceJobs(), listMyCentresForJobs().catch(() => [])]).then(([managed, mine]) => {
        setOn(managed.enabled);
        if (!managed.enabled) return;
        setPosts(managed.posts);
        setApplicants(managed.applicants);
        setCentres(mine);
        setDaycareId((cur) => cur || mine[0]?.id || "");
      });
    }
    return listPublicEceJobs()
      .then((open) => setJobs(open))
      .catch(() => setJobs([]));
  }

  useEffect(() => {
    void eceJobsFlag()
      .then((flag) => {
        if (!flag) {
          setOn(false);
          return;
        }
        setOn(true);
        return load();
      })
      .catch(() => setOn(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  if (!on) return null;
  const title = mode === "daycare" ? copy.jobsDaycareTitle : mode === "org" ? copy.jobsOrgTitle : copy.jobsBrowseTitle;
  const lead = mode === "daycare" ? copy.jobsDaycareLead : mode === "org" ? copy.jobsOrgLead : copy.jobsBrowseLead;

  return (
    <section className="mt-8 w-full max-w-3xl" data-ke={`ece-jobs-${mode}`}>
      <h2 className="font-display text-2xl">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{lead}</p>
      {powers.browse ? (
        jobs.length ? (
          <ul className="mt-4 divide-y divide-border">
            {jobs.map((job) => (
              <li key={job.id} className="py-3">
                <p className="font-medium">{job.role}</p>
                <p className="text-sm text-muted">
                  {job.name}
                  {job.city ? ` · ${job.city}` : ""}
                </p>
                {job.note ? <p className="mt-1 text-sm">{job.note}</p> : null}
                {powers.apply ? <EceJobApply jobId={job.id} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted">{copy.jobsNone}</p>
        )
      ) : null}
      {powers.post && centres.length ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void postEceJob({ data: { daycareId, role, note } })
              .then((result) => {
                setMessage(result.ok ? copy.jobsPosted : copy.jobsOff);
                if (result.ok) {
                  setRole("");
                  setNote("");
                  return load();
                }
                return undefined;
              })
              .catch(() => setMessage(copy.jobsOff));
          }}
        >
          <label className="block text-sm">
            {copy.centre}
            <select className={fieldClass()} value={daycareId} onChange={(event) => setDaycareId(event.target.value)}>
              {centres.map((centre) => (
                <option key={centre.id} value={centre.id}>
                  {centre.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            {copy.role}
            <input className={fieldClass()} value={role} required maxLength={80} onChange={(event) => setRole(event.target.value)} onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest" })} />
          </label>
          <label className="block text-sm">
            {copy.note}
            <input className={fieldClass()} value={note} maxLength={280} onChange={(event) => setNote(event.target.value)} />
          </label>
          <Button type="submit">{copy.post}</Button>
        </form>
      ) : null}
      {powers.manage ? (
        <div className="mt-6 space-y-4">
          <h3 className="font-medium">{copy.jobsOpen}</h3>
          {posts.length ? (
            <ul className="space-y-3">
              {posts.map((post) => (
                <li key={post.id} className="rounded-xl bg-surface p-4 ring-1 ring-border">
                  <p className="font-medium">{post.role}</p>
                  <p className="text-sm text-muted">
                    {post.name}
                    {post.city ? ` · ${post.city}` : ""} · {post.status === "closed" ? copy.jobsClosed : copy.jobsOpen}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="mt-2"
                    onClick={() => {
                      void setEceJobStatus({ data: { jobId: post.id, status: post.status === "open" ? "closed" : "open" } }).then(() => load());
                    }}
                  >
                    {post.status === "open" ? copy.jobsClose : copy.jobsReopen}
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{copy.jobsNone}</p>
          )}
          <h3 className="font-medium">{copy.jobsApplicants}</h3>
          {applicants.length ? (
            <ul className="divide-y divide-border">
              {applicants.map((row) => (
                <li key={row.id} className="py-3 text-sm">
                  <p className="font-medium">
                    {row.name} · {row.role}
                    {mode === "org" ? ` · ${row.centre}` : ""}
                  </p>
                  <p className="text-muted">{row.email}</p>
                  {row.note ? <p className="mt-1">{row.note}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => void setEceApplicationStatus({ data: { applicationId: row.id, status: "reviewed" } }).then(() => load())}>
                      {copy.reviewed}
                    </Button>
                    <Button type="button" size="sm" variant="secondary" onClick={() => void setEceApplicationStatus({ data: { applicationId: row.id, status: "declined" } }).then(() => load())}>
                      {copy.declined}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">{copy.jobsNone}</p>
          )}
        </div>
      ) : null}
      {message ? (
        <p className="mt-3 text-sm" role="status">
          {message}
        </p>
      ) : null}
      <Link to={localePath("/help", locale)} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary">
        {copy.help}
      </Link>
    </section>
  );
}

export function GovJobShortage({ province, locale }: { province: string; locale: "en" | "fr" }) {
  const copy = gapCopy(locale);
  const [row, setRow] = useState<{ enabled: boolean; openJobs: number; centres: number } | null>(null);
  useEffect(() => {
    void listJobShortage({ data: { province } })
      .then((result) => setRow(result))
      .catch(() => setRow({ enabled: false, openJobs: 0, centres: 0 }));
  }, [province]);
  if (!row?.enabled) return null;
  return (
    <section className="mt-8" data-ke="ece-jobs-gov" aria-labelledby="gov-jobs-title">
      <h2 id="gov-jobs-title" className="font-display text-xl">
        {copy.jobsGovTitle}
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">{copy.jobsGovLead}</p>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-border">
          <dt className="text-sm text-muted">{copy.openJobs}</dt>
          <dd className="mt-1 font-display text-2xl">{row.openJobs.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA")}</dd>
        </div>
        <div className="rounded-2xl bg-surface p-4 ring-1 ring-border">
          <dt className="text-sm text-muted">{copy.hiringCentres}</dt>
          <dd className="mt-1 font-display text-2xl">{row.centres.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA")}</dd>
        </div>
      </dl>
    </section>
  );
}
