import { useCallback, useEffect, useId, useState } from "react";
import { Briefcase, ChevronLeft, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChipButton } from "@/components/chip";
import { EmptyState } from "@/components/empty-state";
import { useRoleChrome } from "@/components/role-chrome";
import {
  AutomatedMatchNotice,
  ChipGroup,
  Field,
  FlagPills,
  JobFacts,
  MatchReasons,
  fieldClass,
  useStaffJobsCopy,
} from "@/components/staff-job-board";
import { localePath } from "@/lib/locale-path";
import { STAFF_RESUME_API } from "@/lib/private-docs";
import {
  getHiringDesk,
  getStaffApplicant,
  getStaffJobPeople,
  hireStaffApplicant,
  inviteStaffToJob,
  postStaffJob,
  saveStaffVetting,
  setStaffApplicationStage,
  setStaffJobOpen,
  type ApplicantCard,
  type HiringJob,
  type StaffJob,
  type SuggestedCard,
} from "@/lib/server/staff-jobs";
import {
  APPLICATION_STAGES,
  CARE_GROUPS,
  JOB_ABOUT_MAX,
  JOB_STEPS,
  JOB_TITLE_MAX,
  NO_CERT,
  STAFF_DAYS,
  STAFF_SHIFTS,
  VETTING_STATES,
  WORK_TYPES,
  certLevelLabel,
  certLevelsFor,
  jobStepErrors,
  vettingDone,
  type ApplicationStage,
  type FullStaffProfile,
  type JobDraft,
  type JobError,
  type JobStep,
  type LimitedStaffProfile,
  type MatchResult,
  type ProvinceCode,
  type VettingRow,
} from "@/lib/staff-jobs";
import {
  careWord,
  dayWord,
  jobErrorWord,
  languageWord,
  shiftWord,
  stageWord,
  vettingHintWord,
  vettingItemWord,
  vettingStateWord,
  workWord,
  type StaffJobsCopyKey,
  type StaffJobsLocale,
} from "@/lib/staff-jobs-copy";

type Centre = { id: string; name: string; province: ProvinceCode | "" };
type View = { kind: "list" } | { kind: "post" } | { kind: "job"; jobId: string } | { kind: "applicant"; jobId: string; applicationId: string };

function emptyJobDraft(daycareId: string): JobDraft {
  return {
    daycareId,
    title: "",
    certNeeded: "",
    careGroups: [],
    days: [],
    shifts: [],
    workType: "",
    startDate: "",
    payMin: "",
    payMax: "",
    about: "",
  };
}

const JOB_STEP_TITLE: Record<JobStep, StaffJobsCopyKey> = {
  role: "jobStepRole",
  schedule: "jobStepSchedule",
  centre: "jobStepCentre",
};

function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-11 items-center gap-1 text-sm font-medium text-primary touch-manipulation">
      <ChevronLeft className="size-4" aria-hidden="true" />
      {label}
    </button>
  );
}

function JobWizard({ centres, onDone, onCancel }: { centres: Centre[]; onDone: () => void; onCancel: () => void }) {
  const { l, t } = useStaffJobsCopy();
  const [draft, setDraft] = useState<JobDraft>(() => emptyJobDraft(centres[0]?.id ?? ""));
  const [index, setIndex] = useState(0);
  const [errors, setErrors] = useState<JobError[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const base = useId();
  const fid = (name: string) => `${base}-${name}`;
  const step = JOB_STEPS[index] as JobStep;
  const last = index === JOB_STEPS.length - 1;
  const set = <K extends keyof JobDraft>(key: K, value: JobDraft[K]) => setDraft((cur) => ({ ...cur, [key]: value }));
  const province = centres.find((c) => c.id === draft.daycareId)?.province ?? "";

  const next = () => {
    const found = jobStepErrors(step, draft);
    setErrors(found);
    if (found.length) return;
    if (!last) {
      setIndex(index + 1);
      return;
    }
    setBusy(true);
    void postStaffJob({ data: draft })
      .then((result) => {
        if (result.ok) {
          onDone();
          return;
        }
        if ("errors" in result && Array.isArray(result.errors)) setErrors(result.errors as JobError[]);
        setStatus(result.reason === "off" ? t("off") : t("publishFailed"));
      })
      .catch((err: unknown) => setStatus(err instanceof Error && err.message ? err.message : t("publishFailed")))
      .finally(() => setBusy(false));
  };

  return (
    <section className="mt-6 rounded-2xl bg-surface p-4 ring-1 ring-border sm:p-6" data-ke="staff-job-wizard" aria-labelledby={fid("title")}>
      <p className="text-sm text-muted">{t("stepOf", { n: index + 1, total: JOB_STEPS.length })}</p>
      <div className="mt-2 flex gap-1" aria-hidden="true">
        {JOB_STEPS.map((s, i) => (
          <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-primary" : "bg-border"}`} />
        ))}
      </div>
      <h2 id={fid("title")} className="mt-4 font-display text-2xl">
        {t(JOB_STEP_TITLE[step])}
      </h2>
      <div className="mt-5 space-y-5">
        {step === "role" ? (
          <>
            {centres.length > 1 ? (
              <Field id={fid("centre")} label={t("centre")}>
                <select id={fid("centre")} className={fieldClass} value={draft.daycareId} onChange={(e) => setDraft((cur) => ({ ...cur, daycareId: e.target.value, certNeeded: "" }))}>
                  {centres.map((centre) => (
                    <option key={centre.id} value={centre.id}>
                      {centre.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field id={fid("jt")} label={t("jobTitle")} hint={t("jobTitleHint")}>
              <input id={fid("jt")} className={fieldClass} value={draft.title} maxLength={JOB_TITLE_MAX} onChange={(e) => set("title", e.target.value)} aria-invalid={errors.includes("title")} aria-describedby={`${fid("jt")}-hint`} onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest" })} />
            </Field>
            <Field id={fid("cert")} label={t("certNeeded")}>
              <select id={fid("cert")} className={fieldClass} value={draft.certNeeded || NO_CERT} onChange={(e) => set("certNeeded", e.target.value === NO_CERT ? "" : e.target.value)}>
                <option value={NO_CERT}>{t("anyLevel")}</option>
                {certLevelsFor(province).map((level) => (
                  <option key={level.id} value={level.id}>
                    {l === "fr" ? level.fr : level.en}
                  </option>
                ))}
              </select>
            </Field>
            <ChipGroup legend={t("careGroups")} options={CARE_GROUPS} value={draft.careGroups} onChange={(v) => set("careGroups", v)} word={(g) => careWord(l, g)} />
          </>
        ) : null}
        {step === "schedule" ? (
          <>
            <ChipGroup legend={t("days")} options={STAFF_DAYS} value={draft.days} onChange={(v) => set("days", v)} word={(d) => dayWord(l, d)} />
            <ChipGroup legend={t("shifts")} options={STAFF_SHIFTS} value={draft.shifts} onChange={(v) => set("shifts", v)} word={(s) => shiftWord(l, s)} />
            <fieldset>
              <legend className="text-sm font-medium">{t("workTypes")}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {WORK_TYPES.map((w) => (
                  <ChipButton key={w} on={draft.workType === w} aria-pressed={draft.workType === w} className="whitespace-normal text-sm" onClick={() => set("workType", w)}>
                    {workWord(l, w)}
                  </ChipButton>
                ))}
              </div>
            </fieldset>
            <Field id={fid("start")} label={t("startDate")}>
              <input id={fid("start")} type="date" className={fieldClass} value={draft.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </Field>
            <p className="text-sm text-muted">{t("payHint")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id={fid("pmin")} label={t("payMin")}>
                <input id={fid("pmin")} type="number" inputMode="decimal" min={15} max={80} step="0.25" className={fieldClass} value={draft.payMin} onChange={(e) => set("payMin", e.target.value)} aria-invalid={errors.includes("pay") || errors.includes("pay_order")} onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest" })} />
              </Field>
              <Field id={fid("pmax")} label={t("payMax")}>
                <input id={fid("pmax")} type="number" inputMode="decimal" min={15} max={80} step="0.25" className={fieldClass} value={draft.payMax} onChange={(e) => set("payMax", e.target.value)} aria-invalid={errors.includes("pay") || errors.includes("pay_order")} onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest" })} />
              </Field>
            </div>
          </>
        ) : null}
        {step === "centre" ? (
          <Field id={fid("about")} label={t("about")} hint={t("aboutHint")}>
            <textarea id={fid("about")} className="ke-input mt-1 block h-auto min-h-32 w-full py-2" value={draft.about} maxLength={JOB_ABOUT_MAX} onChange={(e) => set("about", e.target.value)} aria-invalid={errors.includes("about")} aria-describedby={`${fid("about")}-hint`} onFocus={(e) => e.currentTarget.scrollIntoView({ block: "nearest" })} />
          </Field>
        ) : null}
      </div>
      {errors.length ? (
        <ul className="mt-3 space-y-1 text-sm text-danger" role="alert">
          {errors.map((error) => (
            <li key={error}>{jobErrorWord(l, error)}</li>
          ))}
        </ul>
      ) : null}
      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            setErrors([]);
            if (index === 0) onCancel();
            else setIndex(index - 1);
          }}
        >
          {t("back")}
        </Button>
        <Button type="button" onClick={next} disabled={busy} data-ke="staff-job-next">
          {last ? t("publish") : t("next")}
        </Button>
      </div>
      {status ? (
        <p className="mt-3 text-sm" role="status">
          {status}
        </p>
      ) : null}
    </section>
  );
}

function ProfileName({ profile, l }: { profile: LimitedStaffProfile | FullStaffProfile; l: StaffJobsLocale }) {
  const level = certLevelLabel(profile.certLevel, l);
  return (
    <>
      <h3 className="font-medium">{profile.view === "full" ? `${profile.firstName} ${profile.lastName}` : profile.firstName}</h3>
      <p className="mt-0.5 text-sm text-muted">{[level, profile.area].filter(Boolean).join(" · ")}</p>
    </>
  );
}

function SuggestedRow({ card, jobId, l, onInvited }: { card: SuggestedCard; jobId: string; l: StaffJobsLocale; onInvited: () => void }) {
  const { t } = useStaffJobsCopy();
  const [state, setState] = useState<"idle" | "busy" | "done">(card.invited ? "done" : "idle");
  const [error, setError] = useState("");
  return (
    <li className="rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="staff-suggested" data-view={card.profile.view}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{t("shortProfile")}</p>
      <ProfileName profile={card.profile} l={l} />
      <p className="mt-2 text-sm text-muted">
        {[
          card.profile.availability.days.map((x) => dayWord(l, x)).join(", "),
          card.profile.availability.shifts.map((x) => shiftWord(l, x)).join(", "),
          card.profile.availability.workTypes.map((x) => workWord(l, x)).join(", "),
        ].filter(Boolean).join(" · ")}
      </p>
      <p className="mt-2 text-xs text-muted">{t("shortProfileNote")}</p>
      <div className="mt-3">
        {state === "done" ? (
          <p className="text-sm font-medium" role="status">
            {t("invited")}
          </p>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled={state === "busy"}
            onClick={() => {
              setState("busy");
              void inviteStaffToJob({ data: { jobId, ref: card.profile.ref } })
                .then((result) => {
                  if (!result.ok) throw new Error(t("off"));
                  setState("done");
                  onInvited();
                })
                .catch((err: unknown) => {
                  setState("idle");
                  setError(err instanceof Error ? err.message : t("applyFailed"));
                });
            }}
          >
            {t("invite")}
          </Button>
        )}
        {error ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function JobPeople({ jobId, onOpen, onBack }: { jobId: string; onOpen: (applicationId: string) => void; onBack: () => void }) {
  const { l, t } = useStaffJobsCopy();
  const [data, setData] = useState<{ job: StaffJob; applicants: ApplicantCard[]; suggested: SuggestedCard[] } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    void getStaffJobPeople({ data: { jobId } })
      .then((result) => {
        if (live && result.enabled) setData({ job: result.job, applicants: result.applicants, suggested: result.suggested });
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : t("off"));
      });
    return () => {
      live = false;
    };
  }, [jobId, t]);
  if (error) return <EmptyState title={error} action={t("back")} onAction={onBack} />;
  if (!data) return <p className="mt-6 text-sm text-muted" role="status">…</p>;
  return (
    <div className="mt-4" data-ke="staff-job-people">
      <BackLink label={t("myJobs")} onClick={onBack} />
      <h2 className="mt-2 font-display text-2xl">{data.job.title}</h2>
      <JobFacts job={data.job} l={l} />
      <section className="mt-6">
        <h3 className="font-display text-xl">{t("applicants")}</h3>
        {data.applicants.length ? (
          <ul className="mt-3 space-y-3">
            {data.applicants.map((card) => (
              <li key={card.applicationId} className="rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="staff-applicant" data-view={card.profile.view}>
                <ProfileName profile={card.profile} l={l} />
                <p className="mt-1 inline-flex rounded-full bg-surface-2 px-3 py-1 text-sm">{stageWord(l, card.stage)}</p>
                <MatchReasons match={card.match} l={l} />
                <Button type="button" variant="secondary" className="mt-3" onClick={() => onOpen(card.applicationId)}>
                  {t("openApplicant")}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={Users} title={t("noApplicants")} body={data.job.open ? t("noApplicantsBody") : undefined} />
        )}
      </section>
      {data.job.open ? (
        <section className="mt-8">
          <h3 className="font-display text-xl">{t("suggested")}</h3>
          {notice ? (
            <p className="mt-2 text-sm" role="status">
              {notice}
            </p>
          ) : null}
          {data.suggested.length ? (
            <ul className="mt-3 space-y-3">
              {data.suggested.map((card) => (
                <SuggestedRow key={card.profile.ref} card={card} jobId={jobId} l={l} onInvited={() => setNotice(t("inviteSent"))} />
              ))}
            </ul>
          ) : (
            <EmptyState icon={Users} title={t("noSuggested")} body={t("noSuggestedBody")} />
          )}
        </section>
      ) : null}
      <AutomatedMatchNotice side="provider" jobId={jobId} />
    </div>
  );
}

type ApplicantData = {
  applicationId: string;
  stage: ApplicationStage;
  member: boolean;
  profile: LimitedStaffProfile | FullStaffProfile;
  match: MatchResult;
  checklist: VettingRow[];
  jobTitle: string;
};

function VettingLine({ row, applicationId, l, onSaved }: { row: VettingRow; applicationId: string; l: StaffJobsLocale; onSaved: (row: VettingRow) => void }) {
  const { t } = useStaffJobsCopy();
  const [note, setNote] = useState(row.note);
  const id = useId();
  const save = (state: VettingRow["state"], nextNote: string) => {
    void saveStaffVetting({ data: { applicationId, item: row.item, state, note: nextNote } })
      .then(() => onSaved({ ...row, state, note: nextNote }))
      .catch(() => undefined);
  };
  const tone = row.hint === "expired" || row.hint === "record_expired" ? "text-danger" : "text-muted";
  return (
    <li className="py-3" data-ke="staff-vetting-row" data-item={row.item}>
      <p className="font-medium">{vettingItemWord(l, row.item)}</p>
      <p className={`mt-0.5 text-sm ${tone}`}>{vettingHintWord(l, row.hint, row.date)}</p>
      <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label={vettingItemWord(l, row.item)}>
        {VETTING_STATES.map((state) => (
          <ChipButton key={state} on={row.state === state} aria-pressed={row.state === state} className="text-sm" onClick={() => save(state, note)}>
            {vettingStateWord(l, state)}
          </ChipButton>
        ))}
      </div>
      <label htmlFor={id} className="mt-2 block text-sm">
        {t("vettingNote")}
      </label>
      <input id={id} className={fieldClass} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== row.note && save(row.state, note)} />
    </li>
  );
}

function ApplicantDetail({ applicationId, onBack }: { applicationId: string; onBack: () => void }) {
  const { l, t } = useStaffJobsCopy();
  const [data, setData] = useState<ApplicantData | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    let live = true;
    void getStaffApplicant({ data: { applicationId } })
      .then((result) => {
        if (live && result.enabled) setData(result);
      })
      .catch((err: unknown) => {
        if (live) setError(err instanceof Error ? err.message : t("off"));
      });
    return () => {
      live = false;
    };
  }, [applicationId, t]);
  if (error) return <EmptyState title={error} action={t("back")} onAction={onBack} />;
  if (!data) return <p className="mt-6 text-sm text-muted" role="status">…</p>;
  const profile = data.profile;
  const full = profile.view === "full" ? profile : null;
  const setStage = (stage: ApplicationStage) => {
    void setStaffApplicationStage({ data: { applicationId, stage } })
      .then(() => {
        setData((cur) => (cur ? { ...cur, stage } : cur));
        setStatus(t("stageSaved"));
      })
      .catch((err: unknown) => setStatus(err instanceof Error ? err.message : t("saveFailed")));
  };
  return (
    <div className="mt-4" data-ke="staff-applicant-detail" data-view={profile.view}>
      <BackLink label={data.jobTitle} onClick={onBack} />
      <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">{full ? t("fullProfile") : t("shortProfile")}</p>
      <h2 className="font-display text-2xl">{full ? `${full.firstName} ${full.lastName}` : profile.firstName}</h2>
      <p className="mt-1 text-sm text-muted">{[certLevelLabel(profile.certLevel, l), profile.area].filter(Boolean).join(" · ")}</p>
      {full ? <FlagPills flags={full.flags} l={l} /> : null}
      {full?.highlights ? <p className="mt-3">“{full.highlights}”</p> : null}
      <MatchReasons match={data.match} l={l} />
      {full ? (
        <dl className="mt-4 grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
          <dt className="font-medium">{t("email")}</dt>
          <dd className="break-words">
            <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${full.email}`}>
              {full.email}
            </a>
          </dd>
          {full.phone ? (
            <>
              <dt className="font-medium">{t("phoneLabel")}</dt>
              <dd>
                <a className="text-primary underline-offset-4 hover:underline" href={`tel:${full.phone}`}>
                  {full.phone}
                </a>
              </dd>
            </>
          ) : null}
          {full.postalCode ? (
            <>
              <dt className="font-medium">{t("postal")}</dt>
              <dd>{full.postalCode}</dd>
            </>
          ) : null}
          <dt className="font-medium">{t("experience")}</dt>
          <dd>{full.yearsExperience}</dd>
          {full.languages.length ? (
            <>
              <dt className="font-medium">{t("speaks")}</dt>
              <dd>{full.languages.map((x) => languageWord(l, x)).join(", ")}</dd>
            </>
          ) : null}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-muted">{t("shortProfileNote")}</p>
      )}
      {full?.hasResume ? (
        <a
          href={`${STAFF_RESUME_API}?ref=${encodeURIComponent(profile.ref)}`}
          target="_blank"
          rel="noopener"
          className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {t("resume")}
        </a>
      ) : null}

      <section className="mt-8">
        <h3 className="font-display text-xl">{t("stageLabel")}</h3>
        <p className="mt-1 text-sm text-muted">{t("stageHelp")}</p>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("stageLabel")}>
          {APPLICATION_STAGES.filter((stage) => stage !== "hired").map((stage) => (
            <ChipButton key={stage} on={data.stage === stage} aria-pressed={data.stage === stage} className="whitespace-normal text-sm" onClick={() => setStage(stage)}>
              {stageWord(l, stage)}
            </ChipButton>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h3 className="font-display text-xl">{t("vettingTitle")}</h3>
        <p className="mt-1 text-sm text-muted">
          {t("vettingHelp")} ({vettingDone(data.checklist)}/{data.checklist.length})
        </p>
        <ul className="mt-2 divide-y divide-border">
          {data.checklist.map((row) => (
            <VettingLine
              key={row.item}
              row={row}
              applicationId={applicationId}
              l={l}
              onSaved={(saved) => {
                setData((cur) => (cur ? { ...cur, checklist: cur.checklist.map((r) => (r.item === saved.item ? saved : r)) } : cur));
                setStatus(t("vettingSaved"));
              }}
            />
          ))}
        </ul>
      </section>

      <section className="mt-8">
        {data.stage === "hired" ? (
          <p className="font-medium" role="status">
            {stageWord(l, "hired")}
          </p>
        ) : full ? (
          <>
            <Button
              type="button"
              size="lg"
              data-ke="staff-hire"
              onClick={() => {
                void hireStaffApplicant({ data: { applicationId } })
                  .then((result) => {
                    if (!result.ok) throw new Error(t("off"));
                    setData((cur) => (cur ? { ...cur, stage: "hired" } : cur));
                    setStatus(result.inviteError ? `${stageWord(l, "hired")}. ${result.inviteError}` : t("hireInviteDone"));
                  })
                  .catch((err: unknown) => setStatus(err instanceof Error ? err.message : t("saveFailed")));
              }}
            >
              {t("hireInvite")}
            </Button>
            <p className="mt-2 text-sm text-muted">{t("hireInviteHint")}</p>
          </>
        ) : null}
        {status ? (
          <p className="mt-3 text-sm" role="status">
            {status}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function JobRow({ job, l, onOpen, onToggled }: { job: HiringJob; l: StaffJobsLocale; onOpen: () => void; onToggled: () => void }) {
  const { t } = useStaffJobsCopy();
  return (
    <li className="rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="staff-hiring-job">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="font-medium">{job.title}</h3>
        <span className="rounded-full bg-surface-2 px-3 py-1 text-sm">{job.open ? t("open") : t("closed")}</span>
      </div>
      <JobFacts job={job} l={l} />
      <p className="mt-1 text-sm">{t("applicantsCount", { n: job.applicants })}</p>
      {job.open && !job.boardPublic ? (
        <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm" data-ke="staff-job-not-public">
          {t("jobNotPublicYet")}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={onOpen}>
          {t("openApplicant")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            void setStaffJobOpen({ data: { jobId: job.id, open: !job.open } }).then(onToggled).catch(() => undefined);
          }}
        >
          {job.open ? t("closeJob") : t("reopenJob")}
        </Button>
      </div>
    </li>
  );
}

/** /jobs/post when FEATURE_STAFF_JOB_BOARD is on. */
export function StaffHiringDesk() {
  const { l, t, locale } = useStaffJobsCopy();
  const chrome = useRoleChrome();
  const [centres, setCentres] = useState<Centre[]>([]);
  const [jobs, setJobs] = useState<HiringJob[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<View>({ kind: "list" });
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    return getHiringDesk()
      .then((result) => {
        if (!result.enabled) return;
        setCentres(result.centres);
        setJobs(result.jobs);
      })
      .catch(() => {
        setCentres([]);
        setJobs([]);
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!chrome.signedIn || chrome.pending) return;
    void load();
  }, [chrome.signedIn, chrome.pending, load]);

  const signedOut = !chrome.pending && !chrome.signedIn;
  const loginHref = `${localePath("/login", locale)}?next=${encodeURIComponent(localePath("/jobs/post", locale))}`;
  const go = (next: View) => {
    setView(next);
    if (typeof window !== "undefined") window.scrollTo({ top: 0 });
  };

  return (
    <div data-ke="staff-hiring-desk">
      {view.kind === "list" || view.kind === "post" ? (
        <>
          <p className="text-sm font-semibold tracking-wide text-primary">{t("hireKicker")}</p>
          <h1 className="mt-2 text-4xl md:text-5xl">{t("hireTitle")}</h1>
          <p className="mt-6 text-muted">{t("hireLead")}</p>
          <p className="mt-3 flex gap-2 text-sm text-muted">
            <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{t("hirePrivacy")}</span>
          </p>
        </>
      ) : null}

      {view.kind === "post" ? (
        <JobWizard
          centres={centres}
          onCancel={() => go({ kind: "list" })}
          onDone={() => {
            setNotice(t("published"));
            go({ kind: "list" });
            void load();
          }}
        />
      ) : null}

      {view.kind === "list" ? (
        <div className="mt-6">
          {signedOut ? (
            <Button asChild size="lg" data-ke="staff-hire-sign-in">
              <a href={loginHref}>{t("signInToHire")}</a>
            </Button>
          ) : loaded && !centres.length ? (
            <Button asChild size="lg" data-ke="staff-hire-claim">
              <a href={localePath("/claim", locale)}>{t("claimToHire")}</a>
            </Button>
          ) : centres.length ? (
            <Button type="button" size="lg" onClick={() => go({ kind: "post" })} data-ke="staff-post-job">
              {t("postJob")}
            </Button>
          ) : null}
          {notice ? (
            <p className="mt-3 text-sm" role="status">
              {notice}
            </p>
          ) : null}
          {centres.length ? (
            <section className="mt-10">
              <h2 className="font-display text-2xl">{t("myJobs")}</h2>
              {jobs.length ? (
                <ul className="mt-3 space-y-3">
                  {jobs.map((job) => (
                    <JobRow key={job.id} job={job} l={l} onOpen={() => go({ kind: "job", jobId: job.id })} onToggled={() => void load()} />
                  ))}
                </ul>
              ) : (
                <EmptyState icon={Briefcase} title={t("noPosts")} body={t("noPostsBody")} />
              )}
            </section>
          ) : null}
        </div>
      ) : null}

      {view.kind === "job" ? (
        <JobPeople jobId={view.jobId} onBack={() => go({ kind: "list" })} onOpen={(applicationId) => go({ kind: "applicant", jobId: view.jobId, applicationId })} />
      ) : null}
      {view.kind === "applicant" ? <ApplicantDetail applicationId={view.applicationId} onBack={() => go({ kind: "job", jobId: view.jobId })} /> : null}
      {view.kind === "list" && centres.length ? <AutomatedMatchNotice side="provider" /> : null}
    </div>
  );
}

