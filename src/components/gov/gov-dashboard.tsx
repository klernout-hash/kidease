import { useEffect, useState } from "react";
import { govMenuHref, type GovSection } from "@/lib/gov/menu";
import type { GovDashboard } from "@/lib/gov/aggregate";
import { feeBucketLabel, govCopy } from "@/lib/gov/copy";
import { regionForCity } from "@/lib/gov/places";
import { GovFrame } from "@/components/gov/gov-frame";
import { CurriculumGovStrip } from "@/components/curriculum-pack";
import { GovMap } from "@/components/gov/gov-map";

function show(value: number | null, locale: "en" | "fr", hidden: string): string {
  if (value == null) return hidden;
  return value.toLocaleString(locale === "fr" ? "fr-CA" : "en-CA");
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface p-4 ring-1 ring-border">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-display text-2xl">{value}</dd>
    </div>
  );
}

function TileInfo({ text, locale }: { text: string; locale: "en" | "fr" }) {
  return (
    <details className="mt-2">
      <summary className="inline-flex min-h-11 min-w-11 cursor-pointer list-none items-center justify-center rounded-full text-sm font-semibold ring-1 ring-border" aria-label={locale === "fr" ? "Détail" : "Detail"}>
        i
      </summary>
      <p className="mt-2 text-sm leading-6 text-muted">{text}</p>
    </details>
  );
}

const REPORT_TABS = ["screening", "ratios", "complaints", "incidents", "funding"] as const;

function GovReports({ locale, exportBase }: { locale: "en" | "fr"; exportBase: string }) {
  const fr = locale === "fr";
  const labels: Record<(typeof REPORT_TABS)[number], string> = fr
    ? { screening: "Vérifications du personnel", ratios: "Ratios", complaints: "Plaintes", incidents: "Événements graves", funding: "Financement" }
    : { screening: "Staff screening", ratios: "Ratios", complaints: "Complaints", incidents: "Serious occurrences", funding: "Funding" };
  const [tab, setTab] = useState<(typeof REPORT_TABS)[number]>("screening");
  useEffect(() => {
    const found = new URLSearchParams(window.location.search).get("tab");
    if (found && (REPORT_TABS as readonly string[]).includes(found)) setTab(found as (typeof REPORT_TABS)[number]);
  }, []);
  return (
    <section className="mt-6" data-ke="gov-reports">
      <div className="flex gap-2 overflow-x-auto" role="tablist">
        {REPORT_TABS.map((id) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-sm font-medium ring-1 ring-border touch-manipulation" onClick={() => setTab(id)}>
            {labels[id]}
          </button>
        ))}
      </div>
      <p className="mt-4 max-w-2xl text-base leading-6" data-ke="gov-report-empty">
        {fr ? "Pas encore relié. Aucun dossier n’est affiché. Rien n’est envoyé." : "Not connected yet. No case file is shown. Nothing is sent."}
      </p>
      <a className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-primary" href={`${exportBase}&format=csv&locale=${locale}`} data-ke="gov-table-download">
        {fr ? "Télécharger le tableau" : "Download this table"}
      </a>
    </section>
  );
}

function LicenceFlags({
  data,
}: {
  data: GovDashboard & {
    licenceFlags?: Array<{ slug: string; name: string; city: string; status: string; expiry?: string | null }>;
  };
}) {
  const copy = govCopy(data.locale);
  const flags = data.licenceFlags ?? [];
  return (
    <section className="mt-6" data-ke="gov-centre-flags" aria-labelledby="gov-flags-title">
      <h2 id="gov-flags-title" className="font-display text-xl">{copy.flagsTitle}</h2>
      <p className="mt-2 max-w-2xl text-base leading-6">{copy.registerNotLoaded}</p>
      <p className="mt-2 max-w-2xl text-base leading-6">{copy.alertsNotWired}</p>
      {flags.length === 0 ? (
        <p className="mt-3 max-w-2xl text-base leading-6" data-ke="gov-flags-empty">{copy.flagsEmpty}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {flags.map((flag) => (
            <li key={flag.slug} className="rounded-2xl bg-surface p-4 ring-1 ring-border">
              <a className="text-base font-semibold underline-offset-4 hover:underline" href={`/daycare/${flag.slug}`}>
                {flag.name}
              </a>
              <p className="mt-1 text-base">{flag.city ? `${flag.city} · ` : ""}{flag.status}</p>
              {flag.expiry ? (
                <p className="mt-1 text-base">{data.locale === "fr" ? "Échéance enregistrée" : "Stored expiry"}: {flag.expiry}</p>
              ) : null}
              <p className="mt-1 text-base leading-6">{copy.flagsHistory}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const SURVEY_ROWS: Array<[string, string, string, string]> = [
  ["Canada", "14523", "17800", "14663"],
  ["NL", "122", "83", "190"],
  ["PE", "103", "F", "87"],
  ["NS", "219", "146", "519"],
  ["NB", "402", "136", "374"],
  ["QC", "4227", "8966", "3484"],
  ["ON", "4425", "2451", "6463"],
  ["MB", "656", "429", "426"],
  ["SK", "338", "451", "952"],
  ["AB", "1823", "2721", "1790"],
  ["BC", "2138", "2364", "371"],
  ["Territories", "71", "46", "F"],
];

function SurveyContext({ locale }: { locale: "en" | "fr" }) {
  const copy = govCopy(locale);
  const heads = locale === "fr"
    ? ["Région", "En installation", "Domicile permis", "Domicile non permis"]
    : ["Area", "Centre-based", "Licensed home", "Unlicensed home"];
  return (
    <section className="mt-8" data-ke="gov-survey" aria-labelledby="gov-survey-title">
      <h2 id="gov-survey-title" className="font-display text-xl">{copy.surveyTitle}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{copy.surveyNote}</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>{heads.map((head) => <th key={head} className="py-2 pr-3">{head}</th>)}</tr>
          </thead>
          <tbody>
            {SURVEY_ROWS.map((row) => (
              <tr key={row[0]} className="border-t border-border">
                {row.map((cell, index) => <td key={index} className="py-2 pr-3">{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm leading-6">{copy.surveyF}</p>
      <p className="mt-2 text-sm leading-6">{copy.surveyOther}</p>
      <p className="mt-2 text-sm">
        <a className="font-medium text-primary underline-offset-4 hover:underline" href="https://www150.statcan.gc.ca/n1/daily-quotidien/250319/t001b-eng.htm">Statistics Canada, table 001b</a>
      </p>
    </section>
  );
}

const SOURCE_LINKS: Array<[string, string]> = [
  ["British Columbia", "https://www2.gov.bc.ca/gov/content/family-social-supports/caring-for-young-children/family-information/licensed-unlicensed-child-care"],
  ["Alberta", "https://www.alberta.ca/find-childcare"],
  ["Saskatchewan", "https://www.saskatchewan.ca/residents/family-and-social-support/child-care/child-care-in-saskatchewan"],
  ["Manitoba", "https://www.manitoba.ca/education/childcare/mccs-faq.html"],
  ["Ontario", "https://www.earlyyears.edu.gov.on.ca/LCCWWeb/childcare/search.xhtml"],
  ["Quebec", "https://www.quebec.ca/famille-et-soutien-aux-personnes/enfance/garderies-et-services-de-garde/types-services-garde"],
  ["New Brunswick", "https://www2.gnb.ca/content/gnb/en/departments/education/elcc/content/inspection_reports.html"],
  ["Nova Scotia", "https://nsbr-online-services.novascotia.ca/DCSOnline/ECDS/loadSearchPage"],
  ["Prince Edward Island", "https://www.princeedwardisland.ca/en/information/education-and-early-years/early-learning-and-child-care-space-creation-progress"],
  ["Newfoundland and Labrador", "https://www.childcare.gov.nl.ca/public/ccr/family/"],
  ["Yukon", "https://yukon.ca/en/education-and-schools/early-childhood-learning-and-programs/find-early-learning-and-child-care-yukoners"],
  ["Northwest Territories", "https://www.ece.gov.nt.ca/en/elcc/licensed-programs"],
  ["Nunavut", "https://www.gov.nu.ca/en/education-and-schools/licensed-child-care-centres"],
  ["Statistics Canada", "https://www150.statcan.gc.ca/n1/daily-quotidien/250319/t001b-eng.htm"],
];

function TrendBars({ rows }: { rows: Array<{ month: string; listings: number | null }> }) {
  const max = Math.max(1, ...rows.map((row) => row.listings ?? 0));
  if (rows.every((row) => (row.listings ?? 0) === 0)) return null;
  return (
    <div className="mt-3 space-y-2" aria-hidden="true" data-ke="gov-trend-bars">
      {rows.map((row) => (
        <div key={row.month} className="grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
          <span>{row.month}</span>
          <span className="block h-2 rounded-full bg-border">
            <span className="block h-2 rounded-full bg-primary" style={{ width: `${Math.round(((row.listings ?? 0) / max) * 100)}%` }} />
          </span>
          <span>{row.listings ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

function Ledgers({ copy }: { copy: ReturnType<typeof govCopy> }) {
  return (
    <section className="mt-8" data-ke="gov-ledgers" aria-labelledby="gov-ledgers-title">
      <h2 id="gov-ledgers-title" className="font-display text-xl">{copy.ledgersTitle}</h2>
      <ul className="mt-3 space-y-2 text-sm leading-6">
        <li>{copy.ledgerOfficial}</li>
        <li>{copy.ledgerDirectory}</li>
        <li>{copy.ledgerSurvey}</li>
      </ul>
    </section>
  );
}

function SourceRegister({ copy }: { copy: ReturnType<typeof govCopy> }) {
  return (
    <section className="mt-8" id="gov-sources" data-ke="gov-sources" aria-labelledby="gov-sources-title">
      <h2 id="gov-sources-title" className="font-display text-xl">{copy.sourcesTitle}</h2>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{copy.sourcesNote}</p>
      <ul className="mt-3 space-y-2 text-sm">
        {SOURCE_LINKS.map(([label, href]) => (
          <li key={href}>
            <a className="font-medium text-primary underline-offset-4 hover:underline" href={href}>{label}</a>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function GovDashboardView({
  data,
  section = "overview",
}: {
  data: GovDashboard & {
    licenceFlags?: Array<{ slug: string; name: string; city: string; status: string; expiry?: string | null }>;
    childPerSpace?: number | null;
    childRatioNarrowView?: boolean;
  };
  section?: GovSection;
}) {
  const copy = govCopy(data.locale);
  const hidden = copy.suppressed;
  const exportQuery = new URLSearchParams();
  if (data.province) exportQuery.set("province", data.province);
  if (data.region && data.region !== "ALL") exportQuery.set("region", data.region);
  if (data.city && data.city !== "ALL") exportQuery.set("city", data.city);
  const exportBase = `/api/gov/export?${exportQuery.toString()}`;

  const [picked, setPicked] = useState<{ region: string; city: string } | null>(null);
  useEffect(() => {
    setPicked(null);
  }, [data.province, data.region, data.city]);
  const regionValue = picked?.region || data.region;
  const cityValue = picked?.city || data.city;
  const regionOptions = data.selectors.regions.includes(regionValue) ? data.selectors.regions : [...data.selectors.regions, regionValue];
  const cityOptions = data.selectors.cities.includes(cityValue) ? data.selectors.cities : [...data.selectors.cities, cityValue];

  function go(next: { province?: string; region?: string; city?: string }) {
    const province = next.province ?? data.province;
    const region = next.region ?? regionValue;
    const city = next.city ?? cityValue;
    const params = new URLSearchParams();
    if (province) params.set("province", province);
    if (region && region !== "ALL") params.set("region", region);
    if (city && city !== "ALL") params.set("city", city);
    const path = govMenuHref(data.locale, section);
    const href = params.toString() ? `${path}?${params}` : path;
    if (typeof window !== "undefined") window.location.assign(href);
  }

  const kpis = data.kpis;
  const [searchText, setSearchText] = useState("");
  const needle = searchText.trim().toLowerCase();
  const flagged = (data.licenceFlags ?? []).filter((flag) => {
    if (!needle) return true;
    return `${flag.name} ${flag.city} ${flag.slug}`.toLowerCase().includes(needle);
  });
  function monthDelta(current: number | null, previous: number | null): string {
    if (current == null || previous == null) return data.locale === "fr" ? "Pas encore relié" : "Not connected yet";
    const delta = current - previous;
    const sign = delta > 0 ? "+" : "";
    return `${sign}${delta.toLocaleString(data.locale === "fr" ? "fr-CA" : "en-CA")}`;
  }
  const trendLast = data.trends.at(-1);
  const trendPrev = data.trends.at(-2);
  return (
    <GovFrame
      locale={data.locale}
      section={section}
      province={data.province}
      region={regionValue}
      city={cityValue}
      regions={regionOptions}
      cities={cityOptions}
      asOf={`${data.generatedAt.slice(0, 16).replace("T", " ")} UTC`}
      orgName={data.orgName}
      search={searchText}
      onSearch={setSearchText}
      onFilter={(next) => {
        if (next.city && next.city !== "ALL") go({ city: next.city, region: regionForCity(next.city) });
        else go({ region: next.region ?? "ALL", city: next.city ?? "ALL" });
      }}
    >
        {data.demo ? <p className="mt-3 rounded-xl bg-surface px-4 py-3 text-sm ring-1 ring-border">{copy.demo}</p> : null}
        {section === "overview" ? (
        <>
        <div className="flex flex-wrap gap-3">
          <a
            href={`${exportBase}&format=pdf&locale=${data.locale}`}
            className="inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-fg touch-manipulation"
          >
            {copy.downloadPdf}
          </a>
          <a
            href={`${exportBase}&format=csv&locale=${data.locale}`}
            className="inline-flex min-h-11 items-center justify-center rounded-full border border-border bg-surface px-5 text-sm font-medium touch-manipulation"
          >
            {copy.downloadCsv}
          </a>
        </div>

        <dl id="gov-cards" className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-ke="gov-decision-cards">
          <a className="rounded-xl bg-surface p-4 ring-1 ring-border no-underline" data-ke="gov-card-providers" href="#gov-detail">
            <dt className="text-sm text-muted">{data.locale === "fr" ? "Fournisseurs" : "Providers"}</dt>
            <dd className="mt-1 font-display text-2xl whitespace-nowrap hyphens-none tabular-nums">{show(kpis.licensedCentres, data.locale, hidden)}</dd>
            <TileInfo text={copy.cardObservedNote} locale={data.locale} />
          </a>
          <a className="rounded-xl bg-surface p-4 ring-1 ring-border no-underline" data-ke="gov-card-capacity" href="#gov-detail">
            <dt className="text-sm text-muted">{data.locale === "fr" ? "Places permises" : "Licensed spaces"}</dt>
            <dd className="mt-1 font-display text-2xl whitespace-nowrap hyphens-none tabular-nums">{show(kpis.capacity, data.locale, hidden)}</dd>
            <TileInfo text={copy.cardCapacityNote} locale={data.locale} />
          </a>
          <a className="rounded-xl bg-surface p-4 ring-1 ring-border no-underline" data-ke="gov-card-vacancies" href="#gov-detail">
            <dt className="text-sm text-muted">{data.locale === "fr" ? "Places ouvertes" : "Open spots"}</dt>
            <dd className="mt-1 font-display text-2xl whitespace-nowrap hyphens-none tabular-nums">{kpis.vacancyReporters === 0 ? copy.noReporting : show(kpis.openSpots, data.locale, hidden)}</dd>
            <TileInfo text={copy.cardVacancyNote} locale={data.locale} />
          </a>
        </dl>
        <section className="mt-4 rounded-xl bg-surface-2 p-4 text-sm text-muted" data-ke="gov-not-tracked">
          <h2 className="font-medium text-fg">{data.locale === "fr" ? "Pas encore suivi" : "Not tracked yet"}</h2>
          <ul className="mt-2 space-y-1">
            <li><a className="underline-offset-4 hover:underline" href={data.locale === "fr" ? "/fr/gov/expiries" : "/gov/expiries"}>{data.locale === "fr" ? "Permis qui expirent dans 30, 60 ou 90 jours" : "Licences expiring in 30, 60, or 90 days"}</a></li>
            <li><a className="underline-offset-4 hover:underline" href={data.locale === "fr" ? "/fr/gov/reports?tab=complaints" : "/gov/reports?tab=complaints"}>{data.locale === "fr" ? "Plaintes ouvertes" : "Open complaints"}</a></li>
            <li><a className="underline-offset-4 hover:underline" href={data.locale === "fr" ? "/fr/gov/reports?tab=incidents" : "/gov/reports?tab=incidents"}>{data.locale === "fr" ? "Événements graves ce mois-ci" : "Serious occurrences this month"}</a></li>
          </ul>
        </section>
        <GovMap data={data} />
        <section className="mt-6 grid gap-3 lg:grid-cols-2" data-ke="gov-needs-attention" aria-labelledby="gov-needs-title">
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-border">
            <h2 id="gov-needs-title" className="font-display text-xl">{copy.needsTitle}</h2>
            <ul className="mt-3 space-y-2 text-base leading-6">
              <li>{copy.needLicence}</li>
              <li>{copy.needDocument}</li>
              <li>{copy.needInspection}</li>
              <li>{copy.needFindings}</li>
              <li>{copy.needStale}</li>
            </ul>
          </div>
          <p className="self-end text-base leading-6">{copy.mapNote}</p>
        </section>
        <LicenceFlags data={data} />
        {data.hiddenAreas > 0 ? (
          <p className="mt-3 text-sm text-muted">
            {show(data.hiddenAreas, data.locale, hidden)} {copy.hidden}
          </p>
        ) : null}
        <p className="mt-4 text-sm text-muted">
          {data.locale === "fr"
            ? "Les autres tâches sont dans le menu. Un zéro n’est pas une preuve qu’un service n’existe pas."
            : "Other tasks are in the menu. A zero is not proof that a service does not exist."}
        </p>
        </>
        ) : null}

        {section === "overview" ? (
        <>
        <GovMap data={data} />

        <section className="mt-8" aria-labelledby="gov-cities-title">
          <h2 id="gov-cities-title" className="font-display text-xl">
            {copy.cities}
          </h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="py-2 pr-3">{copy.city}</th>
                  <th className="py-2 pr-3">{copy.licensed}</th>
                  <th className="py-2 pr-3">{copy.capacity}</th>
                  <th className="py-2">{copy.spots}</th>
                </tr>
              </thead>
              <tbody>
                {data.cities
                  .filter((row) => !row.suppressed)
                  .map((row) => (
                    <tr key={row.label} className="border-t border-border">
                      <td className="py-2 pr-3">{row.label}</td>
                      <td className="py-2 pr-3">{show(row.centres, data.locale, hidden)}</td>
                      <td className="py-2 pr-3">{show(row.capacity, data.locale, hidden)}</td>
                      <td className="py-2">{show(row.openSpots, data.locale, hidden)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
        </>
        ) : null}

        {section === "analytics" ? (
        <>
        <section className="mt-8" aria-labelledby="gov-fees-title">
          <h2 id="gov-fees-title" className="font-display text-xl">
            {copy.fees}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.fees
              .filter((row) => !row.suppressed)
              .map((row) => (
                <li key={`${row.kind}-${row.bucket}`}>
                  {row.kind === "confirmed" ? copy.feesConfirmed : copy.feesUncited}: {feeBucketLabel(row.bucket, data.locale)} — {show(row.centres, data.locale, hidden)}
                </li>
              ))}
          </ul>
        </section>

        <section className="mt-8" aria-labelledby="gov-wait-title">
          <h2 id="gov-wait-title" className="font-display text-xl">
            {copy.waitlist}
          </h2>
          {data.waitlist.some((row) => !row.suppressed) ? (
            <ul className="mt-3 space-y-2 text-sm">
              {data.waitlist
                .filter((row) => !row.suppressed)
                .map((row) => (
                  <li key={`${row.age}-${row.start}`}>
                    {copy.age}: {row.age}. {copy.start}: {row.start || "—"}. {copy.count}: {show(row.n, data.locale, hidden)}
                  </li>
                ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted">{copy.waitlistEmpty}</p>
          )}
        </section>

        <section className="mt-8" aria-labelledby="gov-trend-title">
          <h2 id="gov-trend-title" className="font-display text-xl">
            {copy.trends}
          </h2>
          <p className="mt-2 text-sm" data-ke="gov-month-change">
            {data.locale === "fr" ? "Changement depuis le mois dernier" : "Change since last month"}: {monthDelta(trendLast?.listings ?? null, trendPrev?.listings ?? null)}
          </p>
          <a className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-primary" href={`${exportBase}&format=csv&locale=${data.locale}`} data-ke="gov-table-download">
            {data.locale === "fr" ? "Télécharger le tableau" : "Download this table"}
          </a>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">{copy.trendChart}</p>
          <TrendBars rows={data.trends} />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th className="py-2 pr-3">{copy.month}</th>
                  <th className="py-2 pr-3">{copy.listingsAdded}</th>
                  <th className="py-2 pr-3">{copy.vacancyUpdates}</th>
                  <th className="py-2">{copy.jobs}</th>
                </tr>
              </thead>
              <tbody>
                {data.trends.map((row) => (
                  <tr key={row.month} className="border-t border-border">
                    <td className="py-2 pr-3">{row.month}</td>
                    <td className="py-2 pr-3">{show(row.listings, data.locale, hidden)}</td>
                    <td className="py-2 pr-3">{show(row.vacancyUpdates, data.locale, hidden)}</td>
                    <td className="py-2">{show(row.jobs, data.locale, hidden)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <SurveyContext locale={data.locale} />
        </>
        ) : null}

        {section === "reports" ? <GovReports locale={data.locale} exportBase={exportBase} /> : null}

        {section === "overview" ? (
        <>
        <section className="mt-8" id="gov-detail" aria-labelledby="gov-detail-title">
          <h2 id="gov-detail-title" className="font-display text-xl">{copy.detailTitle}</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Kpi label={copy.directory} value={show(kpis.directoryCentres, data.locale, hidden)} />
            <Kpi label={copy.licensed} value={show(kpis.licensedCentres, data.locale, hidden)} />
            <Kpi label={copy.reporters} value={kpis.vacancyReporters === 0 ? copy.reportedUnknown : show(kpis.vacancyReporters, data.locale, hidden)} />
            <Kpi label={copy.fresh} value={kpis.vacancyFresh30 === 0 ? copy.reportedUnknown : show(kpis.vacancyFresh30, data.locale, hidden)} />
            <Kpi label={copy.fill} value={kpis.avgFillDays == null ? copy.fillMissing : show(kpis.avgFillDays, data.locale, hidden)} />
            <Kpi label={copy.feesConfirmed} value={show(kpis.feesConfirmedCentres, data.locale, hidden)} />
            <Kpi label={copy.feesUncited} value={show(kpis.feesUncitedCentres, data.locale, hidden)} />
            <Kpi label={copy.feesNone} value={show(kpis.feesNoneCentres, data.locale, hidden)} />
            <Kpi label={copy.program} value={show(kpis.cwelccKnown, data.locale, hidden)} />
            <Kpi label={copy.programUnknown} value={show(kpis.cwelccUnknown, data.locale, hidden)} />
            <Kpi label={copy.french} value={kpis.frenchCentres === 0 ? copy.reportedUnknown : show(kpis.frenchCentres, data.locale, hidden)} />
            <Kpi label={copy.english} value={show(kpis.englishCentres, data.locale, hidden)} />
            <Kpi label={copy.inclusion} value={kpis.inclusionCentres === 0 ? copy.reportedUnknown : show(kpis.inclusionCentres, data.locale, hidden)} />
            <Kpi
              label={copy.childRatio}
              value={
                data.childPerSpace != null
                  ? show(data.childPerSpace, data.locale, hidden)
                  : data.childRatioNarrowView
                    ? copy.childRatioNarrowValue
                    : copy.childRatioMissing
              }
            />
          </dl>
          <p className="mt-3 text-base leading-6" data-ke="gov-child-ratio">{copy.childRatioNote}</p>
          {data.childRatioNarrowView ? <p className="mt-2 text-base leading-6">{copy.childRatioNarrowNote}</p> : null}
          <p className="mt-3 text-base leading-6">{data.locale === "fr" ? "La demande compte des recherches enregistrées, pas des enfants. Une photo manquante ou une fiche non réclamée n’est pas un problème de conformité." : "Demand counts saved searches, not children. A missing photo or an unclaimed listing is not a compliance problem."}</p>
          <p className="mt-3 text-sm">
            <a className="font-medium text-primary underline-offset-4 hover:underline" href={data.locale === "fr" ? "/fr/gov/incidents" : "/gov/incidents"}>
              {data.locale === "fr" ? "Événements graves" : "Serious occurrences"}
            </a>
          </p>
        </section>
        <CurriculumGovStrip province={data.province} />
        </>
        ) : null}

        {section === "expiries" ? (
          <section className="mt-6 max-w-2xl space-y-3 text-base leading-6" data-ke="gov-expiries">
            <p data-ke="gov-not-connected">{data.locale === "fr" ? "Pas encore relié. Les dates de permis ne sont pas connectées. Rien n’est envoyé." : "Not connected yet. Licence dates are not connected. Nothing is sent."}</p>
            <div className="flex flex-wrap gap-2" data-ke="gov-expiry-windows">
              {[30, 60, 90].map((days) => (
                <button key={days} type="button" className="inline-flex min-h-11 items-center rounded-full bg-surface px-3 text-sm ring-1 ring-border" disabled>
                  {days} {data.locale === "fr" ? "jours" : "days"}
                </button>
              ))}
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" disabled data-ke="gov-alert-switch" />
              {data.locale === "fr" ? "Alerte courriel (en attente, rien n’est envoyé)" : "Email alert (held, nothing is sent)"}
            </label>
            {flagged.length > 0 ? <LicenceFlags data={{ ...data, licenceFlags: flagged }} /> : null}
          </section>
        ) : null}

        {section === "data" ? (
        <>
        <Ledgers copy={copy} />
        <SourceRegister copy={copy} />
        <section className="mt-8" aria-labelledby="gov-coverage-title">
          <h2 id="gov-coverage-title" className="font-display text-xl">
            {copy.coverage}
          </h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6">
            {data.coverage.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
        </>
        ) : null}
    </GovFrame>
  );
}
