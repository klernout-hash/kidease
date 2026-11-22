import { useCallback, useEffect, useId, useState, type ReactNode } from "react";
import { Briefcase, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChipButton } from "@/components/chip";
import { EmptyState } from "@/components/empty-state";
import { useRoleChrome } from "@/components/role-chrome";
import { localePath } from "@/lib/locale-path";
import { postPrivateDocForm, STAFF_RESUME_API } from "@/lib/private-docs";
import { acceptMyStaffInvite, listMyStaffInvites } from "@/lib/server/centre-members";
import {
  answerStaffJobInvite,
  applyToStaffJob,
  getMyStaffBoard,
  requestMatchReview,
  saveMyStaffProfile,
  type StaffApplicationRow,
  type StaffInviteRow,
  type StaffJob,
  type StaffMatchRow,
} from "@/lib/server/staff-jobs";
import {
  CARE_GROUPS,
  NO_CERT,
  PROFILE_STEPS,
  PROVINCE_CODES,
  RADIUS_CHOICES,
  STAFF_DAYS,
  STAFF_HIGHLIGHTS_MAX,
  STAFF_LANGUAGES,
  STAFF_SHIFTS,
  STAFF_VISIBILITY,
  WORK_TYPES,
  DEFAULT_RADIUS_KM,
  certLevelsFor,
  profileStepErrors,
  type MatchFlag,
  type MatchResult,
  type ProfileDraft,
  type ProfileError,
  type ProfileStep,
} from "@/lib/staff-jobs";
import {
  careWord,
  dayWord,
  explainMatch,
  flagWord,
  languageWord,
  payWords,
  profileErrorWord,
  provinceWord,
  shiftWord,
  sj,
  staffJobsLocale,
  stageWord,
  visibilityWord,
  workWord,
  type StaffJobsCopyKey,
  type StaffJobsLocale,
} from "@/lib/staff-jobs-copy";
import { useCopy } from "@/lib/use-copy";

// ---------------------------------------------------------------------------
// Shared pieces (also used by the daycare hiring desk)
// ---------------------------------------------------------------------------

export function useStaffJobsCopy() {
  const { locale } = useCopy();
  const l = staffJobsLocale(locale);
  const t = useCallback((key: StaffJobsCopyKey, vars?: Record<string, string | number>) => sj(l, key, vars), [l]);
  return { l, t, locale };
}

export const fieldClass = "ke-input mt-1 block w-full";

function scrollIntoViewOnFocus(event: React.FocusEvent<HTMLElement>) {
  event.currentTarget.scrollIntoView({ block: "nearest" });
}

export function Field({ label, hint, children, id }: { label: string; hint?: string; children: ReactNode; id: string }) {
  return (
    <div className="block">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {hint ? (
        <p id={`${id}-hint`} className="mt-0.5 text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {children}
    </div>
  );
}

export function ChipGroup<T extends string>({
  legend,
  options,
  value,
  onChange,
  word,
  hint,
}: {
  legend: string;
  options: readonly T[];
  value: readonly T[];
  onChange: (next: T[]) => void;
  word: (option: T) => string;
  hint?: string;
}) {
  return (
    <fieldset>
      <legend className="text-sm font-medium">{legend}</legend>
      {hint ? <p className="mt-0.5 text-sm text-muted">{hint}</p> : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((option) => {
          const on = value.includes(option);
          return (
            <ChipButton
              key={option}
              on={on}
              aria-pressed={on}
              className="whitespace-normal text-sm"
              onClick={() => onChange(on ? value.filter((v) => v !== option) : options.filter((o) => o === option || value.includes(o)))}
            >
              {word(option)}
            </ChipButton>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FlagPills({ flags, l }: { flags: readonly MatchFlag[]; l: StaffJobsLocale }) {
  if (!flags.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-2" aria-label={l === "fr" ? "À vérifier" : "To check"}>
      {flags.map((flag) => (
        <li key={flag} className="rounded-full bg-danger/10 px-3 py-1 text-sm font-medium text-danger" data-ke="staff-flag">
          {flagWord(l, flag)}
        </li>
      ))}
    </ul>
  );
}

/** "ECE II · 4 km away · available weekdays · works with toddlers" */
export function MatchReasons({ match, l }: { match: Pick<MatchResult, "good" | "check" | "flags">; l: StaffJobsLocale }) {
  const words = explainMatch(l, match);
  return (
    <div className="mt-2 text-sm" data-ke="match-reasons">
      <FlagPills flags={match.flags.filter((f) => f !== "cert_missing_date")} l={l} />
      {words.good ? (
        <p className="mt-2">
          <span className="font-medium">{sj(l, "whyFits")}: </span>
          {words.good}
        </p>
      ) : null}
      {words.check ? (
        <p className="mt-1 text-muted">
          <span className="font-medium">{sj(l, "toTalkAbout")}: </span>
          {words.check}
        </p>
      ) : null}
    </div>
  );
}

/** Quebec Law 25: matching is automated; anyone can ask a person to review. */
export function AutomatedMatchNotice({ side, jobId }: { side: "staff" | "provider"; jobId?: string }) {
  const { t } = useStaffJobsCopy();
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("");
  const id = useId();
  return (
    <details className="mt-8 rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="automated-match-notice">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 font-medium touch-manipulation">
        <ShieldCheck className="size-4 shrink-0" aria-hidden="true" />
        {t("automatedTitle")}
      </summary>
      <p className="mt-2 text-sm">{t("automatedBody")}</p>
      <p className="mt-3 text-sm">{t("humanReviewBody")}</p>
      <form
        className="mt-2"
        onSubmit={(event) => {
          event.preventDefault();
          void requestMatchReview({ data: { side, jobId, message } })
            .then((result) => setStatus(result.ok ? t("humanReviewSent") : t("off")))
            .catch((err: unknown) => setStatus(err instanceof Error && err.message ? err.message : t("signInFirst")));
        }}
      >
        <label htmlFor={id} className="block text-sm font-medium">
          {t("humanReview")}
        </label>
        <textarea
          id={id}
          className="ke-input mt-1 block h-auto min-h-24 w-full py-2"
          placeholder={t("humanReviewPlaceholder")}
          value={message}
          maxLength={1000}
          onChange={(event) => setMessage(event.target.value)}
          onFocus={scrollIntoViewOnFocus}
        />
        <Button type="submit" variant="secondary" className="mt-2">
          {t("humanReviewSend")}
        </Button>
        {status ? (
          <p className="mt-2 text-sm" role="status">
            {status}
          </p>
        ) : null}
      </form>
    </details>
  );
}

export function JobFacts({ job, l }: { job: StaffJob; l: StaffJobsLocale }) {
  const pay = payWords(l, job.payMinCents, job.payMaxCents);
  const facts = [
    [job.centre, job.city].filter(Boolean).join(" · "),
    pay,
    job.workType ? workWord(l, job.workType as (typeof WORK_TYPES)[number]) : "",
    job.startDate ? sj(l, "starts", { date: job.startDate }) : "",
  ].filter(Boolean);
  return <p className="mt-1 text-sm text-muted">{facts.join(" · ")}</p>;
}

// ---------------------------------------------------------------------------
// Staff side
// ---------------------------------------------------------------------------

type Board = {
  profile: ProfileDraft | null;
  ref: string | null;
  hasResume: boolean;
  openJobs: number;
  matches: StaffMatchRow[];
  applications: StaffApplicationRow[];
  invites: StaffInviteRow[];
};

export function emptyProfileDraft(): ProfileDraft {
  return {
    firstName: "",
    lastName: "",
    province: "",
    certLevel: "",
    certExpiresOn: "",
    firstAidExpiresOn: "",
    yearsExperience: "0",
    careGroups: [],
    days: [],
    shifts: [],
    workTypes: [],
    startDate: "",
    city: "",
    postalCode: "",
    radiusKm: DEFAULT_RADIUS_KM,
    languages: [],
    highlights: "",
    phone: "",
    visibility: "open",
    hideFromEmployer: true,
  };
}

const STEP_TITLE: Record<ProfileStep, StaffJobsCopyKey> = {
  name: "stepName",
  papers: "stepPapers",
  work: "stepWork",
  where: "stepWhere",
  share: "stepShare",
};
const STEP_HINT: Record<ProfileStep, StaffJobsCopyKey> = {
  name: "stepNameHint",
  papers: "stepPapersHint",
  work: "stepWorkHint",
  where: "stepWhereHint",
  share: "stepShareHint",
};

function ErrorList({ errors, l }: { errors: ProfileError[]; l: StaffJobsLocale }) {
  if (!errors.length) return null;
  return (
    <ul className="mt-3 space-y-1 text-sm text-danger" role="alert">
      {errors.map((error) => (
        <li key={error}>{profileErrorWord(l, error)}</li>
      ))}
    </ul>
  );
}

function ProfileWizard({
  initial,
  hasResume,
  onSaved,
  onCancel,
}: {
  initial: ProfileDraft;
  hasResume: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { l, t } = useStaffJobsCopy();
  const [draft, setDraft] = useState<ProfileDraft>(initial);
  const [index, setIndex] = useState(0);
  const [errors, setErrors] = useState<ProfileError[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [resumeStatus, setResumeStatus] = useState(hasResume ? t("resumeOnFile") : "");
  const base = useId();
  const step = PROFILE_STEPS[index] as ProfileStep;
  const last = index === PROFILE_STEPS.length - 1;
  const set = <K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) => setDraft((cur) => ({ ...cur, [key]: value }));
  const levels = certLevelsFor(draft.province);
  const savedBefore = Boolean(initial.firstName);

  const next = () => {
    const found = profileStepErrors(step, draft);
    setErrors(found);
    if (found.length) return;
    if (!last) {
      setIndex(index + 1);
      return;
    }
    setBusy(true);
    setStatus("");
    void saveMyStaffProfile({ data: draft })
      .then((result) => {
        if (result.ok) {
          setStatus(t("saved"));
          onSaved();
          return;
        }
        if ("errors" in result && Array.isArray(result.errors)) setErrors(result.errors as ProfileError[]);
        setStatus(result.reason === "off" ? t("off") : t("saveFailed"));
      })
      .catch(() => setStatus(t("saveFailed")))
      .finally(() => setBusy(false));
  };

  const fid = (name: string) => `${base}-${name}`;

  return (
    <section className="mt-8 rounded-2xl bg-surface p-4 ring-1 ring-border sm:p-6" data-ke="staff-profile-wizard" aria-labelledby={fid("title")}>
      <p className="text-sm text-muted">{t("stepOf", { n: index + 1, total: PROFILE_STEPS.length })}</p>
      <div className="mt-2 flex gap-1" aria-hidden="true">
        {PROFILE_STEPS.map((s, i) => (
          <span key={s} className={`h-1.5 flex-1 rounded-full ${i <= index ? "bg-primary" : "bg-border"}`} />
        ))}
      </div>
      <h2 id={fid("title")} className="mt-4 font-display text-2xl">
        {t(STEP_TITLE[step])}
      </h2>
      <p className="mt-1 text-sm text-muted">{t(STEP_HINT[step])}</p>

      <div className="mt-5 space-y-5">
        {step === "name" ? (
          <>
            <Field id={fid("first")} label={t("firstName")}>
              <input id={fid("first")} className={fieldClass} autoComplete="given-name" value={draft.firstName} maxLength={60} onChange={(e) => set("firstName", e.target.value)} onFocus={scrollIntoViewOnFocus} aria-invalid={errors.includes("first_name")} />
            </Field>
            <Field id={fid("last")} label={t("lastName")}>
              <input id={fid("last")} className={fieldClass} autoComplete="family-name" value={draft.lastName} maxLength={60} onChange={(e) => set("lastName", e.target.value)} onFocus={scrollIntoViewOnFocus} aria-invalid={errors.includes("last_name")} />
            </Field>
          </>
        ) : null}

        {step === "papers" ? (
          <>
            <Field id={fid("prov")} label={t("province")}>
              <select
                id={fid("prov")}
                className={fieldClass}
                value={draft.province}
                aria-invalid={errors.includes("province")}
                onChange={(e) => setDraft((cur) => ({ ...cur, province: e.target.value, certLevel: "" }))}
              >
                <option value="">{t("pickProvince")}</option>
                {PROVINCE_CODES.map((code) => (
                  <option key={code} value={code}>
                    {provinceWord(l, code)}
                  </option>
                ))}
              </select>
            </Field>
            <Field id={fid("level")} label={t("certLevel")}>
              <select id={fid("level")} className={fieldClass} value={draft.certLevel || NO_CERT} onChange={(e) => set("certLevel", e.target.value === NO_CERT ? "" : e.target.value)}>
                <option value={NO_CERT}>{t("noCert")}</option>
                {levels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {l === "fr" ? level.fr : level.en}
                  </option>
                ))}
              </select>
            </Field>
            {draft.certLevel ? (
              <Field id={fid("certdate")} label={t("certExpires")}>
                <input id={fid("certdate")} type="date" className={fieldClass} value={draft.certExpiresOn} onChange={(e) => set("certExpiresOn", e.target.value)} aria-invalid={errors.includes("cert_date")} />
              </Field>
            ) : null}
            <Field id={fid("aid")} label={t("firstAidExpires")} hint={t("dateHint")}>
              <input id={fid("aid")} type="date" className={fieldClass} value={draft.firstAidExpiresOn} onChange={(e) => set("firstAidExpiresOn", e.target.value)} aria-describedby={`${fid("aid")}-hint`} />
            </Field>
            <Field id={fid("years")} label={t("years")}>
              <input id={fid("years")} type="number" inputMode="numeric" min={0} max={50} className={fieldClass} value={draft.yearsExperience} onChange={(e) => set("yearsExperience", e.target.value)} onFocus={scrollIntoViewOnFocus} />
            </Field>
          </>
        ) : null}

        {step === "work" ? (
          <>
            <ChipGroup legend={t("careGroups")} options={CARE_GROUPS} value={draft.careGroups} onChange={(v) => set("careGroups", v)} word={(g) => careWord(l, g)} />
            <ChipGroup legend={t("days")} options={STAFF_DAYS} value={draft.days} onChange={(v) => set("days", v)} word={(d) => dayWord(l, d)} />
            <ChipGroup legend={t("shifts")} options={STAFF_SHIFTS} value={draft.shifts} onChange={(v) => set("shifts", v)} word={(s) => shiftWord(l, s)} />
            <ChipGroup legend={t("workTypes")} options={WORK_TYPES} value={draft.workTypes} onChange={(v) => set("workTypes", v)} word={(w) => workWord(l, w)} />
            <Field id={fid("start")} label={t("startDate")} hint={t("dateHint")}>
              <input id={fid("start")} type="date" className={fieldClass} value={draft.startDate} onChange={(e) => set("startDate", e.target.value)} />
            </Field>
          </>
        ) : null}

        {step === "where" ? (
          <>
            <Field id={fid("city")} label={t("city")}>
              <input id={fid("city")} className={fieldClass} autoComplete="address-level2" value={draft.city} maxLength={80} onChange={(e) => set("city", e.target.value)} onFocus={scrollIntoViewOnFocus} aria-invalid={errors.includes("city")} />
            </Field>
            <Field id={fid("postal")} label={t("postalCode")} hint={t("postalHint")}>
              <input id={fid("postal")} className={fieldClass} autoComplete="postal-code" value={draft.postalCode} maxLength={7} onChange={(e) => set("postalCode", e.target.value)} onFocus={scrollIntoViewOnFocus} aria-invalid={errors.includes("postal_code")} aria-describedby={`${fid("postal")}-hint`} />
            </Field>
            <fieldset>
              <legend className="text-sm font-medium">{t("radius")}</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {RADIUS_CHOICES.map((km) => (
                  <ChipButton key={km} on={draft.radiusKm === km} aria-pressed={draft.radiusKm === km} className="text-sm" onClick={() => set("radiusKm", km)}>
                    {t("km", { n: km })}
                  </ChipButton>
                ))}
              </div>
            </fieldset>
          </>
        ) : null}

        {step === "share" ? (
          <>
            <Field id={fid("hl")} label={t("highlights")} hint={t("highlightsHint")}>
              <input id={fid("hl")} className={fieldClass} value={draft.highlights} maxLength={STAFF_HIGHLIGHTS_MAX} onChange={(e) => set("highlights", e.target.value)} onFocus={scrollIntoViewOnFocus} aria-describedby={`${fid("hl")}-hint`} />
            </Field>
            <ChipGroup legend={t("languages")} hint={t("languagesHint")} options={STAFF_LANGUAGES} value={draft.languages} onChange={(v) => set("languages", v)} word={(x) => languageWord(l, x)} />
            <Field id={fid("phone")} label={t("phone")}>
              <input id={fid("phone")} type="tel" className={fieldClass} autoComplete="tel" value={draft.phone} maxLength={30} onChange={(e) => set("phone", e.target.value)} onFocus={scrollIntoViewOnFocus} />
            </Field>
            <fieldset>
              <legend className="text-sm font-medium">{t("visibility")}</legend>
              <div className="mt-2 space-y-2">
                {STAFF_VISIBILITY.map((v) => (
                  <label key={v} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 ring-1 ring-border">
                    <input type="radio" name={fid("vis")} className="mt-1 size-5 shrink-0" checked={draft.visibility === v} onChange={() => set("visibility", v)} />
                    <span className="text-sm">{visibilityWord(l, v)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl px-3 py-2 ring-1 ring-border">
              <input type="checkbox" className="mt-1 size-5 shrink-0" checked={draft.hideFromEmployer} onChange={(e) => set("hideFromEmployer", e.target.checked)} />
              <span className="text-sm">{t("hideFromEmployer")}</span>
            </label>
            <div>
              <p className="text-sm font-medium">{t("resume")}</p>
              <p className="mt-0.5 text-sm text-muted">{t("resumeHint")}</p>
              {savedBefore ? (
                <label className="mt-2 inline-flex min-h-11 cursor-pointer items-center rounded-full px-4 text-sm font-medium ring-1 ring-border touch-manipulation focus-within:outline focus-within:outline-2 focus-within:outline-ring">
                  {t("resumeAdd")}
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png,image/webp"
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void postPrivateDocForm(STAFF_RESUME_API, {}, file)
                        .then(() => setResumeStatus(t("resumeSaved")))
                        .catch((err: unknown) => setResumeStatus(err instanceof Error ? err.message : t("saveFailed")));
                    }}
                  />
                </label>
              ) : (
                <p className="mt-2 text-sm">{t("resumeSaveProfileFirst")}</p>
              )}
              {resumeStatus ? (
                <p className="mt-2 text-sm" role="status">
                  {resumeStatus}
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </div>

      <ErrorList errors={errors} l={l} />
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
        <Button type="button" onClick={next} disabled={busy} data-ke="staff-profile-next">
          {last ? t("save") : t("next")}
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

function MatchCard({ row, l, onApplied }: { row: StaffMatchRow; l: StaffJobsLocale; onApplied: () => void }) {
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(row.applied ? "done" : "idle");
  const [error, setError] = useState("");
  return (
    <li className="rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="staff-match">
      <h3 className="font-medium">{row.job.title}</h3>
      <JobFacts job={row.job} l={l} />
      <MatchReasons match={row.match} l={l} />
      {row.job.about ? <p className="mt-2 text-sm">{row.job.about}</p> : null}
      <div className="mt-3">
        {state === "done" ? (
          <p className="text-sm font-medium" role="status">
            {sj(l, "applied")} · <span className="font-normal text-muted">{sj(l, "appliedNote")}</span>
          </p>
        ) : (
          <Button
            type="button"
            variant="secondary"
            disabled={state === "busy"}
            onClick={() => {
              setState("busy");
              void applyToStaffJob({ data: { jobId: row.job.id } })
                .then((result) => {
                  if (!result.ok) throw new Error(sj(l, "off"));
                  setState("done");
                  onApplied();
                })
                .catch((err: unknown) => {
                  setState("error");
                  setError(err instanceof Error && err.message ? err.message : sj(l, "applyFailed"));
                });
            }}
          >
            {sj(l, "apply")}
          </Button>
        )}
        {state === "error" && error ? (
          <p className="mt-2 text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function InviteCard({ invite, l, onDone }: { invite: StaffInviteRow; l: StaffJobsLocale; onDone: (message: string) => void }) {
  const [busy, setBusy] = useState(false);
  const answer = (accept: boolean) => {
    setBusy(true);
    void answerStaffJobInvite({ data: { inviteId: invite.id, accept } })
      .then(() => onDone(accept ? sj(l, "inviteAccepted") : ""))
      .catch((err: unknown) => onDone(err instanceof Error ? err.message : sj(l, "applyFailed")))
      .finally(() => setBusy(false));
  };
  return (
    <li className="rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="staff-invite">
      <h3 className="font-medium">{invite.title}</h3>
      <p className="mt-1 text-sm text-muted">{invite.centre}</p>
      {invite.match ? <MatchReasons match={invite.match} l={l} /> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" variant="secondary" disabled={busy} onClick={() => answer(true)}>
          {sj(l, "inviteAccept")}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={() => answer(false)}>
          {sj(l, "inviteDecline")}
        </Button>
      </div>
    </li>
  );
}

function ApplicationsList({ rows, l }: { rows: StaffApplicationRow[]; l: StaffJobsLocale }) {
  const [teamInvites, setTeamInvites] = useState<{ id: string; centre: string }[]>([]);
  const [status, setStatus] = useState("");
  const anyHired = rows.some((row) => row.stage === "hired");
  useEffect(() => {
    if (!anyHired) return;
    let live = true;
    void listMyStaffInvites()
      .then((result) => {
        if (live) setTeamInvites(result.invites);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [anyHired]);
  if (!rows.length) {
    return <EmptyState icon={Briefcase} title={sj(l, "noApplications")} body={sj(l, "noApplicationsBody")} />;
  }
  return (
    <>
      <ul className="mt-3 divide-y divide-border" data-ke="staff-applications">
        {rows.map((row) => {
          const team = row.stage === "hired" ? teamInvites.find((invite) => invite.centre === row.centre) : undefined;
          return (
            <li key={row.id} className="py-3">
              <p className="font-medium">{row.title}</p>
              <p className="text-sm text-muted">{row.centre}</p>
              <p className="mt-1 inline-flex rounded-full bg-surface-2 px-3 py-1 text-sm" data-ke="staff-stage" data-stage={row.stage}>
                {stageWord(l, row.stage)}
              </p>
              {team ? (
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      void acceptMyStaffInvite({ data: { id: team.id } })
                        .then(() => {
                          setTeamInvites((cur) => cur.filter((invite) => invite.id !== team.id));
                          setStatus(sj(l, "joinedTeam"));
                        })
                        .catch((err: unknown) => setStatus(err instanceof Error ? err.message : sj(l, "applyFailed")));
                    }}
                  >
                    {sj(l, "joinTeam")}
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {status ? (
        <p className="mt-2 text-sm" role="status">
          {status}
        </p>
      ) : null}
    </>
  );
}

function PublicJobList({ jobs, l }: { jobs: StaffJob[]; l: StaffJobsLocale }) {
  if (!jobs.length) return <EmptyState icon={Briefcase} title={sj(l, "noJobsYet")} body={sj(l, "noJobsYetBody")} />;
  return (
    <ul className="mt-4 space-y-3" data-ke="staff-public-jobs">
      {jobs.map((job) => (
        <li key={job.id} className="rounded-xl bg-surface p-4 ring-1 ring-border">
          <h3 className="font-medium">{job.title}</h3>
          <JobFacts job={job} l={l} />
          {job.about ? <p className="mt-2 text-sm">{job.about}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** /jobs when FEATURE_STAFF_JOB_BOARD is on. The loader passes open jobs for the first paint. */
export function StaffJobBoard({ initialJobs }: { initialJobs: StaffJob[] }) {
  const { l, t, locale } = useStaffJobsCopy();
  const chrome = useRoleChrome();
  const [board, setBoard] = useState<Board | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(() => {
    return getMyStaffBoard()
      .then((result) => {
        if (!result.enabled) return;
        setBoard({
          profile: result.profile,
          ref: result.ref,
          hasResume: result.hasResume,
          openJobs: result.openJobs,
          matches: result.matches,
          applications: result.applications,
          invites: result.invites,
        });
      })
      .catch(() => setBoard(null))
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (!chrome.signedIn || chrome.pending) return;
    void load();
  }, [chrome.signedIn, chrome.pending, load]);

  const signedOut = !chrome.pending && !chrome.signedIn;
  const loginHref = `${localePath("/login", locale)}?next=${encodeURIComponent(localePath("/jobs", locale))}`;
  const profile = board?.profile ?? null;

  return (
    <div data-ke="staff-job-board">
      <p className="text-sm font-semibold tracking-wide text-primary">{t("kicker")}</p>
      <h1 className="mt-2 text-4xl md:text-5xl">{t("title")}</h1>
      <p className="mt-6 text-muted">{t("lead")}</p>
      <p className="mt-3 flex gap-2 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{t("privacyLead")}</span>
      </p>

      {editing ? (
        <ProfileWizard
          initial={profile ?? emptyProfileDraft()}
          hasResume={board?.hasResume ?? false}
          onCancel={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setNotice(t("saved"));
            void load();
          }}
        />
      ) : (
        <div className="mt-6">
          {signedOut ? (
            <Button asChild size="lg" data-ke="staff-sign-in">
              <a href={loginHref}>{t("signInToStart")}</a>
            </Button>
          ) : loaded && !profile ? (
            <Button type="button" size="lg" onClick={() => setEditing(true)} data-ke="staff-start-profile">
              {t("startProfile")}
            </Button>
          ) : profile ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => setEditing(true)} data-ke="staff-edit-profile">
                {t("editProfile")}
              </Button>
              {board?.hasResume && board.ref ? (
                <a
                  href={`${STAFF_RESUME_API}?ref=${encodeURIComponent(board.ref)}`}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t("resumeOpen")}
                </a>
              ) : null}
            </div>
          ) : null}
          {notice ? (
            <p className="mt-3 text-sm" role="status">
              {notice}
            </p>
          ) : null}
        </div>
      )}

      {!editing && board && profile ? (
        <>
          {board.invites.length ? (
            <section className="mt-10">
              <h2 className="font-display text-2xl">{t("invitesTitle")}</h2>
              <ul className="mt-3 space-y-3">
                {board.invites.map((invite) => (
                  <InviteCard
                    key={invite.id}
                    invite={invite}
                    l={l}
                    onDone={(message) => {
                      setNotice(message);
                      void load();
                    }}
                  />
                ))}
              </ul>
            </section>
          ) : null}
          <section className="mt-10" aria-labelledby="staff-matches">
            <h2 id="staff-matches" className="font-display text-2xl">
              {t("matchesTitle")}
            </h2>
            {board.matches.length ? (
              <ul className="mt-3 space-y-3">
                {board.matches.map((row) => (
                  <MatchCard key={row.job.id} row={row} l={l} onApplied={() => void load()} />
                ))}
              </ul>
            ) : board.openJobs === 0 ? (
              <EmptyState icon={Briefcase} title={t("noJobsYet")} body={t("noJobsYetBody")} />
            ) : (
              <EmptyState icon={Briefcase} title={t("matchesEmpty")} body={t("matchesEmptyBody")} action={t("widenArea")} onAction={() => setEditing(true)} />
            )}
          </section>
          <section className="mt-10" aria-labelledby="staff-apps">
            <h2 id="staff-apps" className="font-display text-2xl">
              {t("myApplications")}
            </h2>
            <ApplicationsList rows={board.applications} l={l} />
          </section>
          <AutomatedMatchNotice side="staff" />
        </>
      ) : null}

      {!editing && !profile ? (
        <section className="mt-10" aria-labelledby="staff-open-jobs">
          <h2 id="staff-open-jobs" className="font-display text-2xl">
            {t("matchesTitle")}
          </h2>
          <PublicJobList jobs={initialJobs} l={l} />
        </section>
      ) : null}
    </div>
  );
}

