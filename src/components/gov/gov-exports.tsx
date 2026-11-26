import type { GovDashboard } from "@/lib/gov/aggregate";
import { formatGovAsOf } from "@/lib/gov/as-of";
import { govCopy } from "@/lib/gov/copy";
import { govPageHref, govPageTitle, type GovLeaf } from "@/lib/gov/desk";
import { GovFrame } from "@/components/gov/gov-frame";

/** Desk pages with a table that has its own suppressed CSV button. */
const TABLE_EXPORTS: GovLeaf[] = ["funding", "demand", "vacancies", "subsidy", "ratios", "screening", "incidents", "complaints", "compliance", "data-requests"];

/** Same PDF and CSV the dashboard already builds, plus a link to each section's own CSV. */
export function GovExportsPage({ data }: { data: GovDashboard }) {
  const copy = govCopy(data.locale);
  const locale = data.locale === "fr" ? "fr" : "en";
  const query = new URLSearchParams();
  if (data.province) query.set("province", data.province);
  if (data.region && data.region !== "ALL") query.set("region", data.region);
  if (data.city && data.city !== "ALL") query.set("city", data.city);
  query.set("locale", data.locale);
  const pdf = `/api/gov/export?${query.toString()}&format=pdf`;
  const csv = `/api/gov/export?${query.toString()}&format=csv`;
  const asOf = formatGovAsOf(data.generatedAt, data.province, locale);
  return (
    <GovFrame locale={locale} section="data" page="exports" province={data.province} asOf={asOf} orgName={data.orgName}>
      <div data-ke="gov-exports">
        <p className="mt-3 max-w-2xl text-base">{copy.exportsWhy}</p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted" data-ke="gov-export-limit">{copy.exportsLimit}</p>
        <p className="mt-2 text-sm text-muted">{data.placeLabel}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href={pdf} className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-fg touch-manipulation">
            {copy.downloadPdf}
          </a>
          <a href={csv} className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-surface px-5 text-sm font-medium touch-manipulation">
            {copy.downloadCsv}
          </a>
        </div>
        <h2 className="mt-8 font-display text-xl">{locale === "fr" ? "CSV par section" : "CSV by section"}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          {locale === "fr"
            ? "Chaque page a son bouton « Télécharger le CSV ». Les groupes de moins de 5 restent masqués. Chaque téléchargement est noté au journal."
            : "Each page has its own Download CSV button. Groups under 5 stay blank. Every download is written to the audit log."}
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2" data-ke="gov-exports-sections">
          {TABLE_EXPORTS.map((leaf) => (
            <li key={leaf}>
              <a className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline" href={govPageHref(locale, leaf)}>
                {govPageTitle(leaf, locale)}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </GovFrame>
  );
}
