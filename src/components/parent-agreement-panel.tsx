import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { signedPdfPath } from "@/lib/docusign-packs";
import {
  agreementError,
  agreementErrorCode,
  agreementStatusLabel,
  defaultAgreementTerms,
  feePeriodLabel,
  sendAgreementAction,
  type AgreementTerms,
  type FeePeriod,
} from "@/lib/parent-agreement";
import {
  listChildAgreements,
  loadCentreAgreementEditor,
  saveCentreAgreementTerms,
  sendParentAgreement,
  voidParentAgreement,
  type ParentAgreementChip,
} from "@/lib/server/parent-agreement";
import { useCopy } from "@/lib/use-copy";

function useFrench() {
  const { locale } = useCopy();
  return locale === "fr";
}

function explain(err: unknown, fr: boolean) {
  const code = agreementErrorCode(err);
  return agreementError(code, fr ? "fr" : "en") || (fr ? "Réessayez dans un moment." : "Try again in a moment.");
}

function focusIn(event: { currentTarget: HTMLElement }) {
  event.currentTarget.scrollIntoView({ block: "center" });
}

const inputClass = "mt-1 w-full min-h-11 rounded-xl border border-border bg-surface px-3";

function Pair({
  enLabel,
  frLabel,
  en,
  fr,
  onEn,
  onFr,
}: {
  enLabel: string;
  frLabel: string;
  en: string;
  fr: string;
  onEn: (value: string) => void;
  onFr: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">
        <span className="font-medium">{enLabel}</span>
        <textarea className={inputClass} rows={3} value={en} onChange={(event) => onEn(event.target.value)} onFocus={focusIn} />
      </label>
      <label className="block text-sm">
        <span className="font-medium">{frLabel}</span>
        <textarea className={inputClass} rows={3} value={fr} onChange={(event) => onFr(event.target.value)} onFocus={focusIn} />
      </label>
    </div>
  );
}

export function CentreAgreementEditor() {
  const fr = useFrench();
  const [centres, setCentres] = useState<Awaited<ReturnType<typeof loadCentreAgreementEditor>>["centres"]>([]);
  const [enabled, setEnabled] = useState(false);
  const [centreId, setCentreId] = useState("");
  const [terms, setTerms] = useState<AgreementTerms>(defaultAgreementTerms());
  const [agreements, setAgreements] = useState<ParentAgreementChip[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadCentreAgreementEditor()
      .then((desk) => {
        setEnabled(desk.enabled);
        setCentres(desk.centres);
        const first = desk.centres[0];
        if (first) {
          setCentreId(first.id);
          setTerms(first.terms);
          setAgreements(first.agreements);
        }
      })
      .catch(() => setEnabled(false));
  }, []);

  if (!enabled) return null;
  const locale = fr ? "fr" : "en";

  function pick(id: string) {
    const centre = centres.find((row) => row.id === id);
    setCentreId(id);
    setTerms(centre?.terms || defaultAgreementTerms());
    setAgreements(centre?.agreements || []);
    setNote("");
    setError("");
  }

  function patch(partial: Partial<AgreementTerms>) {
    setTerms((current) => ({ ...current, ...partial }));
  }

  async function save() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const saved = await saveCentreAgreementTerms({ data: { daycareId: centreId, terms } });
      setTerms(saved.terms);
      setNote(fr ? "Termes enregistrés. Ils restent hors de la fiche publique." : "Terms saved. They stay off the public listing.");
    } catch (err) {
      setError(explain(err, fr));
    } finally {
      setBusy(false);
    }
  }

  async function voidAgreement(agreementId: string) {
    setError("");
    try {
      await voidParentAgreement({ data: { agreementId } });
      setAgreements((rows) => rows.map((row) => (row.agreementId === agreementId ? { ...row, status: "void" } : row)));
      setNote(fr ? "Entente annulée." : "Agreement voided.");
    } catch (err) {
      setError(explain(err, fr));
    }
  }

  return (
    <section className="mt-6 rounded-xl bg-surface p-5 text-left ring-1 ring-border" data-ke="parent-agreement-editor">
      <h2 className="font-display text-2xl">{fr ? "Entente avec la famille" : "Agreement with the family"}</h2>
      <p className="mt-2 max-w-prose text-sm text-muted">
        {fr
          ? "Cette entente est entre votre centre et le parent. KidEase l’envoie seulement pour la signature."
          : "This agreement is between your centre and the parent. KidEase only sends it for signature."}
      </p>
      <p className="mt-2 max-w-prose text-sm">
        {fr ? "Enregistrez vos termes. Ensuite, envoyez-les depuis une place acceptée." : "Save your terms. Then send them from an accepted spot."}
      </p>
      {centres.length === 0 ? (
        <p className="mt-4 text-sm">
          <a className="inline-flex min-h-11 items-center text-primary underline" href="/claim">
            {fr ? "Réclamez votre centre pour écrire l’entente." : "Claim your centre to write the agreement."}
          </a>
        </p>
      ) : (
        <>
          {centres.length > 1 ? (
            <label className="mt-4 block text-sm">
              <span className="font-medium">{fr ? "Centre" : "Centre"}</span>
              <select className={inputClass} value={centreId} onChange={(event) => pick(event.target.value)}>
                {centres.map((centre) => (
                  <option key={centre.id} value={centre.id}>
                    {centre.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="mt-4 text-sm font-medium">{centres[0]?.name}</p>
          )}
          <div className="mt-4 space-y-4">
            <Pair
              enLabel={fr ? "Heures (anglais)" : "Hours (English)"}
              frLabel={fr ? "Heures (français)" : "Hours (French)"}
              en={terms.hoursEn}
              fr={terms.hoursFr}
              onEn={(hoursEn) => patch({ hoursEn })}
              onFr={(hoursFr) => patch({ hoursFr })}
            />
            <Pair
              enLabel={fr ? "Jours de garde (anglais)" : "Days of care (English)"}
              frLabel={fr ? "Jours de garde (français)" : "Days of care (French)"}
              en={terms.daysEn}
              fr={terms.daysFr}
              onEn={(daysEn) => patch({ daysEn })}
              onFr={(daysFr) => patch({ daysFr })}
            />
            <label className="block text-sm">
              <span className="font-medium">{fr ? "Date de début habituelle" : "Usual start date"}</span>
              <input
                type="date"
                className={inputClass}
                value={terms.startDate}
                onChange={(event) => patch({ startDate: event.target.value })}
                onFocus={focusIn}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className="font-medium">{fr ? "Frais par période (anglais)" : "Fee per period (English)"}</span>
                <input className={inputClass} value={terms.feeEn} onChange={(event) => patch({ feeEn: event.target.value })} onFocus={focusIn} />
              </label>
              <label className="block text-sm">
                <span className="font-medium">{fr ? "Frais par période (français)" : "Fee per period (French)"}</span>
                <input className={inputClass} value={terms.feeFr} onChange={(event) => patch({ feeFr: event.target.value })} onFocus={focusIn} />
              </label>
            </div>
            <label className="block text-sm">
              <span className="font-medium">{fr ? "Période" : "Period"}</span>
              <select
                className={inputClass}
                value={terms.feePeriod}
                onChange={(event) => patch({ feePeriod: event.target.value as FeePeriod })}
              >
                <option value="day">{feePeriodLabel("day", locale)}</option>
                <option value="week">{feePeriodLabel("week", locale)}</option>
                <option value="month">{feePeriodLabel("month", locale)}</option>
              </select>
            </label>
            <p className="text-sm text-muted">
              {fr
                ? "Ces frais restent dans l’entente. Ils ne deviennent pas le tarif public de la fiche."
                : "This fee stays inside the agreement. It does not become the public listing price."}
            </p>
            <Pair
              enLabel={fr ? "Frais de base avant réduction (anglais)" : "Base fee before reduction (English)"}
              frLabel={fr ? "Frais de base avant réduction (français)" : "Base fee before reduction (French)"}
              en={terms.baseFeeEn || ""}
              fr={terms.baseFeeFr || ""}
              onEn={(baseFeeEn) => patch({ baseFeeEn })}
              onFr={(baseFeeFr) => patch({ baseFeeFr })}
            />
            <Pair
              enLabel={fr ? "Frais après réduction APGJE / provinciale (anglais)" : "Fee after CWELCC / provincial reduction (English)"}
              frLabel={fr ? "Frais après réduction APGJE / provinciale (français)" : "Fee after CWELCC / provincial reduction (French)"}
              en={terms.reducedFeeEn || ""}
              fr={terms.reducedFeeFr || ""}
              onEn={(reducedFeeEn) => patch({ reducedFeeEn })}
              onFr={(reducedFeeFr) => patch({ reducedFeeFr })}
            />
            <Pair
              enLabel={fr ? "Cycle de facturation (anglais)" : "Billing cycle (English)"}
              frLabel={fr ? "Cycle de facturation (français)" : "Billing cycle (French)"}
              en={terms.billingCycleEn || ""}
              fr={terms.billingCycleFr || ""}
              onEn={(billingCycleEn) => patch({ billingCycleEn })}
              onFr={(billingCycleFr) => patch({ billingCycleFr })}
            />
            <Pair
              enLabel={fr ? "Avis de hausse des frais (anglais)" : "Fee increase notice (English)"}
              frLabel={fr ? "Avis de hausse des frais (français)" : "Fee increase notice (French)"}
              en={terms.feeIncreaseEn || ""}
              fr={terms.feeIncreaseFr || ""}
              onEn={(feeIncreaseEn) => patch({ feeIncreaseEn })}
              onFr={(feeIncreaseFr) => patch({ feeIncreaseFr })}
            />
            <Pair
              enLabel={fr ? "Dépôt (anglais)" : "Deposit (English)"}
              frLabel={fr ? "Dépôt (français)" : "Deposit (French)"}
              en={terms.depositEn}
              fr={terms.depositFr}
              onEn={(depositEn) => patch({ depositEn })}
              onFr={(depositFr) => patch({ depositFr })}
            />
            <Pair
              enLabel={fr ? "Préavis de retrait (anglais)" : "Notice to withdraw (English)"}
              frLabel={fr ? "Préavis de retrait (français)" : "Notice to withdraw (French)"}
              en={terms.noticeEn}
              fr={terms.noticeFr}
              onEn={(noticeEn) => patch({ noticeEn })}
              onFr={(noticeFr) => patch({ noticeFr })}
            />
            <Pair
              enLabel={fr ? "Départ en retard (anglais)" : "Late pickup (English)"}
              frLabel={fr ? "Départ en retard (français)" : "Late pickup (French)"}
              en={terms.lateEn}
              fr={terms.lateFr}
              onEn={(lateEn) => patch({ lateEn })}
              onFr={(lateFr) => patch({ lateFr })}
            />
            <Pair
              enLabel={fr ? "Enfant malade (anglais)" : "Sick child (English)"}
              frLabel={fr ? "Enfant malade (français)" : "Sick child (French)"}
              en={terms.sickEn}
              fr={terms.sickFr}
              onEn={(sickEn) => patch({ sickEn })}
              onFr={(sickFr) => patch({ sickFr })}
            />
            <Pair
              enLabel={fr ? "Jours fériés et fermetures (anglais)" : "Holidays and closures (English)"}
              frLabel={fr ? "Jours fériés et fermetures (français)" : "Holidays and closures (French)"}
              en={terms.holidaysEn}
              fr={terms.holidaysFr}
              onEn={(holidaysEn) => patch({ holidaysEn })}
              onFr={(holidaysFr) => patch({ holidaysFr })}
            />
            <div>
              <p className="text-sm font-medium">{fr ? "Clauses ajoutées" : "Extra clauses"}</p>
              {terms.clauses.map((clause, index) => (
                <div key={index} className="mt-3 rounded-xl bg-bg p-3">
                  <Pair
                    enLabel={fr ? `Clause ${index + 1} (anglais)` : `Clause ${index + 1} (English)`}
                    frLabel={fr ? `Clause ${index + 1} (français)` : `Clause ${index + 1} (French)`}
                    en={clause.en}
                    fr={clause.fr}
                    onEn={(en) =>
                      patch({
                        clauses: terms.clauses.map((row, rowIndex) => (rowIndex === index ? { ...row, en } : row)),
                      })
                    }
                    onFr={(value) =>
                      patch({
                        clauses: terms.clauses.map((row, rowIndex) => (rowIndex === index ? { ...row, fr: value } : row)),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    className="mt-2"
                    onClick={() => patch({ clauses: terms.clauses.filter((_, rowIndex) => rowIndex !== index) })}
                  >
                    {fr ? "Retirer la clause" : "Remove clause"}
                  </Button>
                </div>
              ))}
              {terms.clauses.length < 8 ? (
                <Button
                  type="button"
                  variant="secondary"
                  className="mt-3"
                  onClick={() => patch({ clauses: [...terms.clauses, { en: "", fr: "" }] })}
                >
                  {fr ? "Ajouter une clause" : "Add a clause"}
                </Button>
              ) : null}
            </div>
          </div>
          <Button type="button" className="mt-5" disabled={busy || !centreId} onClick={() => void save()}>
            {fr ? "Enregistrer les termes" : "Save terms"}
          </Button>
          {note ? (
            <p className="mt-3 text-sm" role="status">
              {note}
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm text-danger" role="alert">
              {error}
            </p>
          ) : null}
          {agreements.length ? (
            <ul className="mt-6 divide-y divide-border">
              {agreements.map((row) => (
                <li key={row.agreementId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="font-medium">{row.childName}</p>
                    <p className="text-sm text-muted">
                      {agreementStatusLabel(row.status, locale)}
                      {row.startDate ? ` · ${row.startDate}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {row.status === "completed" ? (
                      <a className="inline-flex min-h-11 items-center text-sm text-primary underline" href={signedPdfPath(row.contractId)}>
                        {fr ? "Télécharger le PDF signé" : "Download the signed PDF"}
                      </a>
                    ) : null}
                    {row.status === "sent" || row.status === "parent_signed" || row.status === "draft" ? (
                      <Button type="button" variant="secondary" onClick={() => void voidAgreement(row.agreementId)}>
                        {fr ? "Annuler" : "Void"}
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      )}
    </section>
  );
}

export function AgreementRequestAction({
  bookingId,
  bookingStatus,
  chip,
  enabled,
  onSent,
}: {
  bookingId: string;
  bookingStatus: string;
  chip: ParentAgreementChip | null;
  enabled: boolean;
  onSent: () => void;
}) {
  const fr = useFrench();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!enabled) return null;
  const action = sendAgreementAction(chip?.status ?? null, bookingStatus === "accepted" || bookingStatus === "active");
  if (action === "hidden") return null;
  const locale = fr ? "fr" : "en";

  async function send() {
    setBusy(true);
    setError("");
    try {
      await sendParentAgreement({ data: { bookingId } });
      toast.success(fr ? "Entente envoyée dans DocuSign." : "Agreement sent in DocuSign.");
      onSent();
    } catch (err) {
      setError(explain(err, fr));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3" data-ke="send-parent-agreement">
      {action === "send" ? (
        <Button type="button" disabled={busy} onClick={() => void send()}>
          {fr ? "Envoyer l’entente" : "Send agreement"}
        </Button>
      ) : null}
      {action === "wait" && chip ? (
        <p className="text-sm text-muted" role="status">
          {agreementStatusLabel(chip.status, locale)}
        </p>
      ) : null}
      {action === "download" && chip ? (
        <a className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline" href={signedPdfPath(chip.contractId)}>
          {fr ? "Télécharger l’entente signée" : "Download the signed agreement"}
        </a>
      ) : null}
      {error ? (
        <p className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function ChildAgreementFile({ childId }: { childId: string }) {
  const fr = useFrench();
  const [enabled, setEnabled] = useState(false);
  const [rows, setRows] = useState<ParentAgreementChip[]>([]);

  useEffect(() => {
    void listChildAgreements({ data: { childId } })
      .then((result) => {
        setEnabled(result.enabled);
        setRows(result.rows);
      })
      .catch(() => setEnabled(false));
  }, [childId]);

  if (!enabled) return null;
  const locale = fr ? "fr" : "en";
  return (
    <section className="mt-4 rounded-xl bg-surface p-4 ring-1 ring-border" data-ke="child-agreement-file">
      <h3 className="text-base font-semibold">{fr ? "Entente d’inscription" : "Enrolment agreement"}</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          {fr
            ? "Pas encore d’entente. Le centre peut l’envoyer après avoir accepté une place."
            : "No agreement yet. The centre can send one after it accepts a spot."}
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {rows.map((row) => (
            <li key={row.agreementId}>
              <p className="font-medium">{row.daycareName}</p>
              <p className="text-sm text-muted">
                {row.childName} · {agreementStatusLabel(row.status, locale)}
                {row.startDate ? ` · ${row.startDate}` : ""}
              </p>
              {row.status === "completed" ? (
                <a className="inline-flex min-h-11 items-center text-sm text-primary underline" href={signedPdfPath(row.contractId)}>
                  {fr ? "Télécharger le PDF signé" : "Download the signed PDF"}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
