import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { AttendanceOption, AttendanceReview } from "@/lib/payroll/attendance-review.ts";
import { payrollAttendanceReview } from "@/lib/server/payroll-desk";
import { withTimeout } from "@/lib/timeout";

const COPY = {
  en: {
    title: "Review staff hours",
    lead: "Choose a centre and a staff member to see their check-in and check-out records. This does not calculate or send pay.",
    centre: "Centre",
    chooseCentre: "Choose a centre",
    staff: "Staff member",
    chooseStaff: "Choose a staff member",
    noneCentre:
      "No centres you own were found. Go to Listings to check that your centre is linked.",
    noneStaff:
      "This centre has no staff set up for payroll. Set up their payroll profiles before reviewing their hours here.",
    nonePunches: "No clock records for this person in the last 14 days.",
    history:
      "Last 14 days and shifts still open. Dates and times are shown in your device’s time zone.",
    more: "Showing the 100 most recent records. This is not a complete pay period.",
    in: "Checked in",
    out: "Checked out",
    open: "Still checked in",
    approved: "Hours approved",
    pending: "Needs review",
    duration: "Recorded time after unpaid breaks",
    invalid: "Recorded time unavailable",
    loading: "Checking records…",
    problem: "Couldn’t load the records. Check your connection and try again.",
    missing:
      "This staff member is no longer available for this centre. Go back and choose a staff member again.",
    retry: "Try again",
    off: "Staff hours are turned off.",
  },
  fr: {
    title: "Vérifier les heures du personnel",
    lead: "Choisissez un centre et un membre du personnel pour voir ses heures d’arrivée et de départ. Aucun salaire n’est calculé ni versé.",
    centre: "Centre",
    chooseCentre: "Choisir un centre",
    staff: "Membre du personnel",
    chooseStaff: "Choisir un membre du personnel",
    noneCentre:
      "Aucun centre à votre nom n’a été trouvé. Allez dans les fiches pour vérifier que votre centre est lié.",
    noneStaff:
      "Aucun membre du personnel n’est inscrit à la paie de ce centre. Configurez les dossiers de paie avant de vérifier les heures ici.",
    nonePunches: "Aucun pointage pour cette personne dans les 14 derniers jours.",
    history:
      "14 derniers jours et quarts encore ouverts. Les dates et heures suivent le fuseau horaire de votre appareil.",
    more: "Les 100 pointages les plus récents sont affichés. Ce n’est pas une période de paie complète.",
    in: "Arrivée",
    out: "Départ",
    open: "Quart encore ouvert",
    approved: "Heures approuvées",
    pending: "À vérifier",
    duration: "Temps enregistré, pauses non payées déduites",
    invalid: "Temps enregistré non disponible",
    loading: "Vérification des pointages…",
    problem: "Impossible de charger les pointages. Vérifiez votre connexion et réessayez.",
    missing:
      "Cette personne n’est plus disponible pour ce centre. Revenez en arrière et choisissez de nouveau un membre du personnel.",
    retry: "Réessayer",
    off: "Le relevé des heures est désactivé.",
  },
} as const;

type Locale = keyof typeof COPY;
type ReviewCopy = (typeof COPY)[Locale];
type ReviewState =
  { status: "loading" } | { status: "error" } | { status: "ready"; value: AttendanceReview };

function useReview(daycareId: string, employeeId: string) {
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ReviewState>({ status: "loading" });
  useEffect(() => {
    let active = true;
    void withTimeout(
      payrollAttendanceReview({ data: { daycareId, employeeId } }),
      12_000,
      "payroll-attendance-timeout",
    ).then(
      (value) => {
        if (active) setState({ status: "ready", value });
      },
      () => {
        if (active) setState({ status: "error" });
      },
    );
    return () => {
      active = false;
    };
  }, [attempt, daycareId, employeeId]);
  return {
    state,
    retry: () => {
      setState({ status: "loading" });
      setAttempt((value) => value + 1);
    },
  };
}

function LoadIssue({
  copy,
  state,
  retry,
}: {
  copy: ReviewCopy;
  state: ReviewState;
  retry: () => void;
}) {
  if (state.status === "loading") return <p role="status">{copy.loading}</p>;
  if (state.status === "error")
    return (
      <div className="space-y-2">
        <p role="alert">{copy.problem}</p>
        <Button type="button" variant="secondary" onClick={retry}>
          {copy.retry}
        </Button>
      </div>
    );
  return <p role="status">{state.value.kind === "off" ? copy.off : copy.missing}</p>;
}

function Choice({
  label,
  prompt,
  options,
  value,
  onChange,
}: {
  label: string;
  prompt: string;
  options: AttendanceOption[];
  value: string;
  onChange: (value: string) => void;
}) {
  const counts = new Map<string, number>();
  for (const option of options) counts.set(option.name, (counts.get(option.name) ?? 0) + 1);
  return (
    <label className="block text-sm font-medium">
      {label}
      <select
        className="mt-1 min-h-11 w-full max-w-full rounded-xl bg-surface px-3 text-base ring-1 ring-border"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{prompt}</option>
        {options.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
            {(counts.get(item.name) ?? 0) > 1 ? ` · ${item.id.slice(-8)}` : ""}
          </option>
        ))}
      </select>
    </label>
  );
}

function PunchReview({
  copy,
  locale,
  daycareId,
  employeeId,
}: {
  copy: ReviewCopy;
  locale: Locale;
  daycareId: string;
  employeeId: string;
}) {
  const { state, retry } = useReview(daycareId, employeeId);
  if (state.status !== "ready" || state.value.kind !== "punches") {
    return <LoadIssue copy={copy} state={state} retry={retry} />;
  }
  if (!state.value.rows.length) return <p role="status">{copy.nonePunches}</p>;
  const dateTime = new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">{copy.history}</p>
      {state.value.more ? <p role="status">{copy.more}</p> : null}
      <ul className="space-y-2">
        {state.value.rows.map((record) => (
          <li key={record.id} className="space-y-1 rounded-2xl bg-surface p-4 ring-1 ring-border">
            <p>
              {copy.in}:{" "}
              <time dateTime={record.clockIn}>{dateTime.format(new Date(record.clockIn))}</time>
            </p>
            <p>
              {record.clockOut ? (
                <>
                  {copy.out}:{" "}
                  <time dateTime={record.clockOut}>
                    {dateTime.format(new Date(record.clockOut))}
                  </time>
                </>
              ) : (
                copy.open
              )}
            </p>
            <p>
              {record.recordedMinutes === null
                ? copy.invalid
                : `${copy.duration}: ${Math.floor(record.recordedMinutes / 60)} h ${record.recordedMinutes % 60} min`}
            </p>
            <p className="text-sm text-muted">
              {record.approved && record.recordedMinutes !== null ? copy.approved : copy.pending}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StaffReview({
  copy,
  locale,
  daycareId,
}: {
  copy: ReviewCopy;
  locale: Locale;
  daycareId: string;
}) {
  const [selected, setSelected] = useState("");
  const { state, retry } = useReview(daycareId, "");
  if (state.status !== "ready" || state.value.kind !== "staff") {
    return <LoadIssue copy={copy} state={state} retry={retry} />;
  }
  if (!state.value.options.length) return <p role="status">{copy.noneStaff}</p>;
  return (
    <>
      <Choice
        label={copy.staff}
        prompt={copy.chooseStaff}
        options={state.value.options}
        value={selected}
        onChange={setSelected}
      />
      {selected ? (
        <PunchReview
          key={selected}
          copy={copy}
          locale={locale}
          daycareId={daycareId}
          employeeId={selected}
        />
      ) : null}
    </>
  );
}

export function PayrollAttendanceReview({ locale }: { locale: Locale }) {
  const copy = COPY[locale];
  const [selected, setSelected] = useState("");
  const { state, retry } = useReview("", "");
  return (
    <section className="mx-auto w-full max-w-xl space-y-4 px-1" data-ke="payroll-attendance-review">
      <h1 className="font-display text-2xl">{copy.title}</h1>
      <p className="text-sm text-muted">{copy.lead}</p>
      {state.status === "ready" && state.value.kind === "centres" ? (
        state.value.options.length ? (
          <>
            <Choice
              label={copy.centre}
              prompt={copy.chooseCentre}
              options={state.value.options}
              value={selected}
              onChange={setSelected}
            />
            {selected ? (
              <StaffReview key={selected} copy={copy} locale={locale} daycareId={selected} />
            ) : null}
          </>
        ) : (
          <p role="status">{copy.noneCentre}</p>
        )
      ) : (
        <LoadIssue copy={copy} state={state} retry={retry} />
      )}
    </section>
  );
}
