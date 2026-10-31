import type { PublicInspection } from "@/lib/inspection-history";
import { inspectionChecklistBadge, inspectionPortal, licenceStanding, publicLicenceLine, type ChecklistItem } from "@/lib/provincial-inspections";
import { useCopy } from "@/lib/use-copy";

export function InspectionTrustCard({
  province,
  name,
  licenseNumber,
  listingId,
  licenseStatus,
  claimed,
  checklist,
  inspections,
}: {
  province: string;
  name: string;
  licenseNumber?: string | null;
  listingId?: string | null;
  licenseStatus?: string | null;
  claimed?: boolean;
  checklist?: ChecklistItem[] | null;
  inspections?: PublicInspection[];
}) {
  const { locale } = useCopy();
  const fr = locale === "fr";
  const licence = publicLicenceLine(licenseNumber, listingId);
  const portal = inspectionPortal(province, name, fr ? "fr" : "en");
  const standing = licenceStanding(licenseStatus);
  const badge = inspectionChecklistBadge(checklist, Boolean(claimed));
  if (!licence && !portal) return null;

  return (
    <section className="mt-4 rounded-2xl bg-surface p-4 text-fg shadow-sm ring-1 ring-border" data-ke="inspection-trust">
      <h2 className="font-display text-2xl">{fr ? "Permis et inspection" : "Licence and inspection"}</h2>
      {licence ? (
        <p className="mt-2 text-sm">
          <span className="text-muted">{fr ? "Permis officiel" : "Official licence"} </span>
          <span className="font-semibold tabular-nums">{licence}</span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted">{fr ? "Numéro de permis non publié." : "Licence number is not published."}</p>
      )}
      {standing === "active" ? (
        <p className="mt-2 inline-flex min-h-8 items-center rounded-full bg-emerald-50 px-3 text-sm font-medium text-emerald-900">
          {fr ? "Permis actif" : "Active licence"}
        </p>
      ) : null}
      {badge.show ? (
        <p className="mt-2 text-sm text-muted">
          {fr
            ? `Liste de contrôle du centre : ${badge.passed} sur ${badge.total}.`
            : `Centre checklist: ${badge.passed} of ${badge.total}.`}
        </p>
      ) : null}
      {inspections?.length ? (
        <ul className="mt-3 space-y-3" data-ke="inspection-history">
          {inspections.map((row) => (
            <li key={`${row.inspectedOn}-${row.sourceUrl}`} className="text-sm">
              <p className="font-medium">
                {row.inspectedOn} · {row.outcome}
              </p>
              {row.summary ? <p className="mt-1 text-muted">{row.summary}</p> : null}
              <a
                href={row.sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex min-h-11 items-center text-primary underline-offset-4 hover:underline"
              >
                {fr ? "Dossier public" : "Public record"}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
      {portal ? (
        <a
          href={portal.url}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex min-h-11 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-fg touch-manipulation"
        >
          {fr ? portal.labelFr : portal.labelEn}
        </a>
      ) : null}
    </section>
  );
}
