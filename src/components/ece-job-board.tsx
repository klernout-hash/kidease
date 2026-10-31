import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { eceJobCopy } from "@/lib/ece-jobs";
import { localePath } from "@/lib/locale-path";
import {
  applyToEceJob,
  eceJobsFlag,
  listMyCentresForJobs,
  listMyEceApplicants,
  listPublicEceJobs,
  postEceJob,
} from "@/lib/server/ece-jobs";
import { useCopy } from "@/lib/use-copy";

type PublicJob = { id: string; role: string; note: string; name: string; slug: string; city: string };

export function EceJobApply({ jobId }: { jobId: string }) {
  const { locale } = useCopy();
  const copy = eceJobCopy(locale === "fr" ? "fr" : "en");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  return (
    <form
      className="mt-2"
      data-ke="ece-apply"
      onSubmit={(event) => {
        event.preventDefault();
        void applyToEceJob({ data: { jobId, note } })
          .then((result) => setMessage(result.ok ? copy.applied : copy.off))
          .catch(() => setMessage(copy.signIn));
      }}
    >
      <label className="block text-sm">
        {copy.note}
        <input
          className="mt-1 block w-full min-h-11 rounded-lg bg-surface px-3 ring-1 ring-border"
          value={note}
          maxLength={280}
          onChange={(event) => setNote(event.target.value)}
          onFocus={(event) => event.currentTarget.scrollIntoView({ block: "nearest" })}
        />
      </label>
      <Button type="submit" className="mt-2" size="sm">
        {copy.apply}
      </Button>
      {message ? (
        <p className="mt-2 text-sm text-muted" role="status">
          {message}
        </p>
      ) : null}
    </form>
  );
}

export function EceJobBoard() {
  const { locale } = useCopy();
  const lang = locale === "fr" ? "fr" : "en";
  const copy = eceJobCopy(lang);
  const [enabled, setEnabled] = useState(false);
  const [jobs, setJobs] = useState<PublicJob[]>([]);
  const [centres, setCentres] = useState<{ id: string; name: string }[]>([]);
  const [daycareId, setDaycareId] = useState("");
  const [role, setRole] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [applicants, setApplicants] = useState<{ id: string; role: string; name: string; email: string; note: string }[]>([]);

  useEffect(() => {
    void eceJobsFlag()
      .then(async (on) => {
        setEnabled(Boolean(on));
        if (!on) return;
        const [open, mine, people] = await Promise.all([
          listPublicEceJobs(),
          listMyCentresForJobs().catch(() => []),
          listMyEceApplicants().catch(() => []),
        ]);
        setJobs(open);
        setCentres(mine);
        setDaycareId(mine[0]?.id || "");
        setApplicants(people);
      })
      .catch(() => setEnabled(false));
  }, []);

  if (!enabled) return null;

  return (
    <section className="mt-8" data-ke="ece-jobs">
      <h2 className="text-xl font-semibold">{copy.title}</h2>
      {jobs.length ? (
        <ul className="mt-3 divide-y divide-border">
          {jobs.map((job) => (
            <li key={job.id} className="py-3">
              <p className="font-medium">{job.role}</p>
              <p className="text-sm text-muted">
                {job.name}
                {job.city ? ` · ${job.city}` : ""}
              </p>
              {job.note ? <p className="mt-1 text-sm">{job.note}</p> : null}
              <Link to="/daycare/$slug" params={{ slug: job.slug }} className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-primary">
                {job.name}
              </Link>
              <EceJobApply jobId={job.id} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">{copy.empty}</p>
      )}
      {centres.length ? (
        <form
          className="mt-6 space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void postEceJob({ data: { daycareId, role, note } })
              .then((result) => setMessage(result.ok ? copy.posted : copy.off))
              .catch(() => setMessage(copy.off));
          }}
        >
          <h3 className="font-medium">{copy.post}</h3>
          <label className="block text-sm">
            {copy.role}
            <input
              className="mt-1 block w-full min-h-11 rounded-lg bg-surface px-3 ring-1 ring-border"
              value={role}
              maxLength={80}
              required
              onChange={(event) => setRole(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Centre
            <select
              className="mt-1 block w-full min-h-11 rounded-lg bg-surface px-3 ring-1 ring-border"
              value={daycareId}
              onChange={(event) => setDaycareId(event.target.value)}
            >
              {centres.map((centre) => (
                <option key={centre.id} value={centre.id}>
                  {centre.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            {copy.note}
            <input
              className="mt-1 block w-full min-h-11 rounded-lg bg-surface px-3 ring-1 ring-border"
              value={note}
              maxLength={280}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
          <Button type="submit">{copy.send}</Button>
        </form>
      ) : null}
      {centres.length ? (
        <div className="mt-6">
          <h3 className="font-medium">{copy.applicants}</h3>
          {applicants.length ? (
            <ul className="mt-2 divide-y divide-border">
              {applicants.map((row) => (
                <li key={row.id} className="py-2 text-sm">
                  <p className="font-medium">
                    {row.name} · {row.role}
                  </p>
                  <p className="text-muted">{row.email}</p>
                  {row.note ? <p className="mt-1">{row.note}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-muted">{copy.empty}</p>
          )}
        </div>
      ) : null}
      {message ? (
        <p className="mt-3 text-sm" role="status">
          {message}
        </p>
      ) : null}
      <Link
        to={localePath("/help", locale)}
        className="mt-3 inline-flex min-h-11 min-w-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        {copy.help}
      </Link>
    </section>
  );
}
