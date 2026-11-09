import type { PublicInspection } from "@/lib/inspection-history";
import { inspectionChecklistBadge, inspectionPortal, publicLicenceLine, type ChecklistItem } from "@/lib/provincial-inspections";
import { useCopy } from "@/lib/use-copy";

export function InspectionTrustCard({
  province,
  name,
  licenseNumber,
  listingId,
  licenseStatus,
  licenseExpiry,
  claimed,
  checklist,
  inspections,
  compact = false,
}: {
  province: string;
  name: string;
  licenseNumber?: string | null;
  listingId?: string | null;
  licenseStatus?: string | null;
  licenseExpiry?: string | null;
  claimed?: boolean;
  checklist?: ChecklistItem[] | null;
  inspections?: PublicInspection[];
  /** Guest detail: one line plus a disclosure, not a dominant panel. */
  compact?: boolean;
}) {
  const { locale, t } = useCopy();
  const fr = locale === "fr";
  const licence = publicLicenceLine(licenseNumber, listingId);
  const portal = inspectionPortal(province, name, fr ? "fr" : "en");
  const badge = inspectionChecklistBadge(checklist, Boolean(claimed));
  if (!licence && !portal) return null;

  if (compact) {
    return (
      <section className="mt-4 text-sm leading-6" data-ke="inspection-trust" data-licence-status={licenseStatus || ""} data-compact="1">
        <h2 className="text-[16px] font-semibold leading-[22px]">{t("licenceAndInspection")}</h2>
        <p className="mt-1 text-muted">
          {licence ? (
            <>
              {t("licenceOnRecord")} <span className="font-medium text-fg tabular-nums">{licence}</span>
              {" · "}
            </>
          ) : null}
          {t("licenceNotLiveGov")}
        </p>
        {licenseStatus && licenseStatus !== "unverified" && licenseStatus !== "unknown" ? (
          <p className="mt-1" data-ke="stored-licence-status">
            {fr ? "Statut enregistré" : "Stored status"}: {licenseStatus}
          </p>
        ) : null}
        {licenseExpiry ? (
          <p className="mt-1" data-ke="stored-licence-expiry">
            {fr ? "Échéance enregistrée" : "Stored expiry"}: {licenseExpiry}
          </p>
        ) : null}
        <details className="mt-1">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-primary">
            {fr ? "Voir le détail" : "View details"}
          </summary>
          {badge.show ? (
            <p className="mt-2 text-muted">
              {t("kideaseChecklist").replace("{passed}", String(badge.passed)).replace("{total}", String(badge.total))}
            </p>
          ) : null}
          {inspections?.length ? (
            <ul className="mt-2 space-y-2" data-ke="inspection-history">
              {inspections.map((row) => (
                <li key={`${row.inspectedOn}-${row.sourceUrl}`}>
                  <p className="font-medium">
                    {row.inspectedOn} · {row.outcome}
                  </p>
                  <a href={row.sourceUrl} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
                    {t("publicRecord")}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
          {portal ? (
            <a href={portal.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">
              {fr ? portal.labelFr : portal.labelEn || t("openPublicRegistry")}
            </a>
          ) : null}
        </details>
      </section>
    );
  }

  return (
    <section
      className="mt-4 rounded-2xl bg-surface p-4 text-fg shadow-sm ring-1 ring-border"
      data-ke="inspection-trust"
      data-licence-status={licenseStatus || ""}
    >
      <h2 className="font-display text-2xl">{t("licenceAndInspection")}</h2>
      {licence ? (
        <p className="mt-2 text-sm">
          <span className="text-muted">{t("licenceOnRecord")} </span>
          <span className="font-semibold tabular-nums">{licence}</span>
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted">{t("licenceNotPublished")}</p>
      )}
      <p className="mt-2 text-sm text-muted">{t("licenceNotLiveGov")}</p>
      {licenseStatus && licenseStatus !== "unverified" && licenseStatus !== "unknown" ? (
        <p className="mt-2 text-sm" data-ke="stored-licence-status">
          {fr ? "Statut enregistré" : "Stored status"}: {licenseStatus}
        </p>
      ) : null}
      {licenseExpiry ? (
        <p className="mt-1 text-sm" data-ke="stored-licence-expiry">
          {fr ? "Échéance enregistrée" : "Stored expiry"}: {licenseExpiry}
        </p>
      ) : null}
      {badge.show ? (
        <p className="mt-2 text-sm text-muted">
          {t("kideaseChecklist").replace("{passed}", String(badge.passed)).replace("{total}", String(badge.total))}
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
                {t("publicRecord")}
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
          {locale === "fr" ? portal.labelFr : locale === "en" ? portal.labelEn : t("openPublicRegistry")}
        </a>
      ) : null}
    </section>
  );
}
