import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  decodeLicensingProgress,
  LICENSING_GUIDES,
  LICENSING_REVIEW_DATE,
  LICENSING_STEPS,
  LICENSING_STORAGE_PREFIX,
  type LicensingStep,
} from "@/lib/daycare-licensing-checklist";

const LABELS = {
  pathway: [
    "Confirm your program type and eligibility",
    "Confirmer le type de garde et l’admissibilité",
  ],
  space: ["Check the proposed location", "Vérifier le lieu proposé"],
  staff: ["Check staffing and screening", "Vérifier la dotation et les vérifications requises"],
  application: ["Prepare and submit the application", "Préparer et déposer la demande"],
  inspection: ["Prepare for the inspection", "Se préparer à l’inspection"],
  renewal: ["Plan for renewal", "Planifier le renouvellement"],
} as const;

const BODY = {
  space: [
    "Before signing a lease or renovating, ask which zoning, building, fire and health requirements apply to your specific site and care model.",
    "Avant de signer un bail ou de rénover, vérifiez les exigences de zonage, de bâtiment, d’incendie et de santé applicables à votre lieu et à votre type de garde.",
  ],
  staff: [
    "Ask the regulator for the qualifications, checks, first aid and staffing ratios for your program. Do not upload staff records here.",
    "Demandez à l’autorité les exigences de qualification, de vérification, de premiers soins et de ratios pour votre programme. Ne téléversez aucun dossier du personnel ici.",
  ],
  inspection: [
    "Ask who schedules inspections and which records need to be available. Do not assume that filing an application authorizes you to operate as licensed.",
    "Vérifiez qui planifie les inspections et quels documents doivent être disponibles. Le dépôt d’une demande ne vous autorise pas à exercer à titre de service agréé.",
  ],
  renewal: [
    "After approval, record the expiry date and confirm renewal forms, reporting duties, fees and inspection requirements with the regulator.",
    "Après l’approbation, notez la date d’expiration et vérifiez auprès de l’autorité les formulaires, les déclarations, les frais et les inspections liés au renouvellement.",
  ],
} as const;

export function DaycareLicensingChecklist({
  code,
  locale,
  officialUrl,
}: {
  code: string;
  locale: string;
  officialUrl: string;
}) {
  const [progress, setProgress] = useState<LicensingStep[]>([]);
  const [saveFailed, setSaveFailed] = useState(false);
  const storageKey = LICENSING_STORAGE_PREFIX + code;
  const guide = LICENSING_GUIDES[code];
  const fr = locale === "fr";
  const lang = fr ? 1 : 0;

  useEffect(() => {
    try {
      setProgress(decodeLicensingProgress(window.localStorage.getItem(storageKey)));
    } catch {
      setSaveFailed(true);
    }
  }, [storageKey]);

  function toggle(id: LicensingStep, checked: boolean) {
    const next = checked ? [...new Set([...progress, id])] : progress.filter((step) => step !== id);
    setProgress(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      setSaveFailed(true);
    }
  }

  if (!guide) return null;
  const source = (fr ? guide.sourceFr : undefined) ?? guide.source ?? officialUrl;
  const reviewed = fr ? "22 novembre 2026" : "November 22, 2026";

  return (
    <section className="mt-6 border-t border-border pt-6" aria-labelledby="licensing-checklist">
      <h4 id="licensing-checklist" className="text-lg font-semibold">
        {fr ? "Votre liste de vérification pour le permis" : "Your licensing checklist"}
      </h4>
      <p className="mt-2 text-sm leading-6 text-muted">
        {fr
          ? "Information générale, pas un avis juridique. Confirmez les exigences et les frais auprès de votre autorité. Aucun compte n’est nécessaire : la région et les cases cochées sont enregistrées dans ce navigateur seulement."
          : "General information, not legal advice. Confirm requirements and fees with your regulator. No account is needed: your region and checked items are saved only in this browser."}
      </p>
      <p className="mt-2 text-sm text-muted">
        {fr ? "Sources consultées le " : "Sources checked "}
        <time dateTime={LICENSING_REVIEW_DATE}>{reviewed}</time>.
      </p>
      <p className="mt-2 text-sm" aria-live="polite" aria-atomic="true">
        {fr
          ? progress.length + " étapes sur " + LICENSING_STEPS.length + " cochées"
          : progress.length + " of " + LICENSING_STEPS.length + " steps checked"}
      </p>
      {saveFailed && (
        <p className="mt-2 text-sm" role="status">
          {fr
            ? "Ce navigateur n’a pas pu conserver votre progression. Gardez la page ouverte ou notez les étapes vous-même."
            : "This browser couldn’t save your progress. Keep this page open or make a note of your steps."}
        </p>
      )}
      <ol className="mt-4 space-y-3">
        {LICENSING_STEPS.map((id, index) => {
          const detail =
            id === "pathway" ? guide.pathway : id === "application" ? guide.application : BODY[id];
          return (
            <li key={id} className="rounded-xl border border-border px-3">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 py-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={progress.includes(id)}
                  onChange={(event) => toggle(id, event.currentTarget.checked)}
                  aria-describedby={"licensing-detail-" + id}
                  className="size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                />
                <span>
                  {index + 1}. {LABELS[id][lang]}
                </span>
              </label>
              <p id={"licensing-detail-" + id} className="pb-3 pl-8 text-sm leading-6 text-muted">
                {detail[lang]}
              </p>
              {id === "pathway" && guide.orientationLinks && (
                <ul className="pb-3 pl-8">
                  {guide.orientationLinks.map(({ label, url }) => (
                    <li key={url[0]}>
                      <a
                        href={url[lang]}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4"
                      >
                        {label[lang]}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
      <dl className="mt-5 space-y-3 text-sm leading-6">
        <div>
          <dt className="font-semibold">{fr ? "Frais" : "Fees"}</dt>
          <dd className="text-muted">
            {guide.costs?.[lang] ??
              (fr
                ? "Aucun montant vérifié pour votre démarche ici. Vérifiez auprès de l’autorité les frais de demande, de renouvellement et d’inspection."
                : "No amount verified here for your pathway. Ask the regulator about application, renewal and inspection fees.")}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">{fr ? "Délais" : "Timing"}</dt>
          <dd className="text-muted">
            {guide.timing?.[lang] ??
              (fr
                ? "Aucun délai vérifié ici. Demandez le délai actuel pour un dossier complet et la disponibilité des inspections."
                : "No timeline verified here. Ask about current processing times for a complete application and inspection availability.")}
          </dd>
        </div>
      </dl>
      <a
        href={source}
        className="mt-3 inline-flex min-h-11 items-center break-words text-sm font-medium text-primary underline underline-offset-4"
      >
        {fr ? "Consulter l’autorité : démarches et formulaires" : "Regulator’s guide and forms"}
      </a>
      <p>
        <Link
          to={fr ? "/fr/contact" : "/contact"}
          className="inline-flex min-h-11 items-center text-sm text-primary underline underline-offset-4"
        >
          {fr ? "Signaler une information périmée" : "Tell us if something is out of date"}
        </Link>
      </p>
    </section>
  );
}
