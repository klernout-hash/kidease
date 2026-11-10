import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import type { GovDashboard } from "@/lib/gov/aggregate";
import { feeBucketLabel, govCopy, govPath } from "@/lib/gov/copy";
import { regionForCity, regionLabel } from "@/lib/gov/places";
import { GovHelp } from "@/components/gov/gov-help";
import { CurriculumGovStrip } from "@/components/curriculum-pack";
import { GovJobShortage } from "@/components/ece-job-desk";
import { GovMap } from "@/components/gov/gov-map";
import { signOut } from "@/lib/auth/client";
import { deskGroups } from "@/lib/gov/sections";

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

type GovView = "overview" | "marketplace" | "health" | "expiries" | "workforce" | "analytics" | "sources";

const GOV_VIEWS: Array<{ id: GovView; en: string; fr: string }> = [
  { id: "overview", en: "Overview", fr: "Aperçu" },
  { id: "marketplace", en: "Marketplace and availability", fr: "Places et disponibilité" },
  { id: "health", en: "Listing health and compliance", fr: "Santé des fiches et conformité" },
  { id: "expiries", en: "Expiries and alerts", fr: "Échéances et alertes" },
  { id: "workforce", en: "Workforce and jobs", fr: "Personnel et emplois" },
  { id: "analytics", en: "Analytics and data", fr: "Analyses et données" },
  { id: "sources", en: "Sources and definitions", fr: "Sources et définitions" },
];

function GovTaskNav({
  locale,
  view,
  onView,
}: {
  locale: "en" | "fr";
  view: GovView;
  onView: (next: GovView) => void;
}) {
  const copy = govCopy(locale);
  const pages = deskGroups(locale, copy, true)
    .flatMap((group) => group.links)
    .filter(([href]) => href.startsWith("/"));
  return (
    <nav className="mt-4 flex flex-col gap-1 lg:sticky lg:top-28 lg:max-h-[calc(100dvh-8rem)] lg:overflow-y-auto" data-ke="gov-nav" aria-label={locale === "fr" ? "Tâches du bureau" : "Desk tasks"}>
      {GOV_VIEWS.map((item) => {
        const current = view === item.id;
        return (
          <button
            key={item.id}
            type="button"
            data-ke="gov-task"
            data-view={item.id}
            aria-current={current ? "page" : undefined}
            className={
              current
                ? "inline-flex min-h-11 items-center rounded-xl bg-surface px-3 text-left text-base font-semibold ring-1 ring-border touch-manipulation"
                : "inline-flex min-h-11 items-center rounded-xl px-3 text-left text-base font-medium touch-manipulation hover:bg-surface"
            }
            onClick={() => onView(item.id)}
          >
            {locale === "fr" ? item.fr : item.en}
          </button>
        );
      })}
      <p className="mt-4 px-3 text-base font-semibold">{copy.otherPages}</p>
      {pages.map(([href, label]) => (
        <a key={href} href={href} className="inline-flex min-h-11 items-center rounded-xl px-3 text-base font-medium hover:bg-surface">
          {label}
        </a>
      ))}
      <a className="inline-flex min-h-11 items-center rounded-xl px-3 text-base font-semibold text-primary" href={locale === "fr" ? "/fr/search" : "/search"} data-ke="gov-browse-public">
        {locale === "fr" ? "Voir les fiches publiques" : "Browse public listings"}
      </a>
    </nav>
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
}: {
  data: GovDashboard & {
    licenceFlags?: Array<{ slug: string; name: string; city: string; status: string; expiry?: string | null }>;
    childPerSpace?: number | null;
    childRatioNarrowView?: boolean;
  };
}) {
  const copy = govCopy(data.locale);
  const hidden = copy.suppressed;
  const navigate = useNavigate();
  const other = data.locale === "fr" ? "en" : "fr";
  const query = new URLSearchParams();
  if (data.province) query.set("province", data.province);
  if (data.region && data.region !== "ALL") query.set("region", data.region);
  if (data.city && data.city !== "ALL") query.set("city", data.city);
  const exportBase = `/api/gov/export?${query.toString()}`;

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
    setPicked({ region: region || "ALL", city: city || "ALL" });
    void navigate({
      to: data.locale === "fr" ? "/fr/gov" : "/gov",
      search: {
        province,
        region: region && region !== "ALL" ? region : "",
        city: city && city !== "ALL" ? city : "",
      },
    });
  }

  const kpis = data.kpis;
  const [view, setView] = useState<GovView>("overview");
  const complianceHref = data.locale === "fr" ? "/fr/gov/compliance" : "/gov/compliance";
  return (
    <div className="w-full min-h-dvh overflow-x-hidden bg-bg text-fg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
      <a href="#gov-main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-10 focus:bg-surface focus:px-3 focus:py-2">
        {copy.title}
      </a>
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        <p className="font-display text-lg">KidEase</p>
        <div className="flex flex-wrap items-center gap-2">
          <GovHelp locale={data.locale} />
          <Link
            to={govPath(other)}
            search={{ province: data.province, region: data.region, city: data.city }}
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium underline-offset-4 hover:underline"
          >
            {copy.language}
          </Link>
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium touch-manipulation"
            onClick={() => void signOut(govPath(data.locale, "login"))}
          >
            {copy.signOut}
          </button>
        </div>
      </header>
      <main id="gov-main" className="mx-auto w-full max-w-5xl px-4 pb-16" data-ke="gov-dashboard">
        <p className="text-sm font-medium text-muted">{copy.what}</p>
        <h1 className="mt-1 font-display text-3xl">{data.placeLabel}</h1>
        <p className="mt-2 max-w-2xl text-base">{copy.why}</p>
        <p className="mt-1 text-sm text-muted">
          {copy.org}: {data.orgName}
        </p>
        <p className="mt-1 text-base" data-ke="gov-as-of">
          {copy.asOf} {data.generatedAt.slice(0, 16).replace("T", " ")} UTC
        </p>
        {data.demo ? <p className="mt-3 rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-border">{copy.demo}</p> : null}

        <div className="sticky top-0 z-30 -mx-4 mt-6 border-b border-border bg-bg px-4 py-3" data-ke="gov-filters">
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={(event) => event.preventDefault()}>
          <label className="block text-sm font-medium">
            {copy.province}
            <select
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3"
              value={data.province}
              onChange={(event) => go({ province: event.target.value, region: "ALL", city: "ALL" })}
            >
              {data.selectors.provinces.map((row) => (
                <option key={row.code} value={row.code}>
                  {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            {copy.region}
            <select
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3"
              value={regionValue}
              onChange={(event) => go({ region: event.target.value, city: "ALL" })}
            >
              {regionOptions.map((region) => (
                <option key={region} value={region}>
                  {region === "ALL" ? (data.locale === "fr" ? "Toutes les régions" : "All regions") : regionLabel(region, data.locale)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            {copy.city}
            <select
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3"
              value={cityValue}
              onChange={(event) => {
                const city = event.target.value;
                if (!city || city === "ALL") go({ city: "ALL" });
                else go({ city, region: regionForCity(city) });
              }}
            >
              {cityOptions.map((city) => (
                <option key={city} value={city}>
                  {city === "ALL" ? (data.locale === "fr" ? "Toutes les villes" : "All cities") : city}
                </option>
              ))}
            </select>
          </label>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {data.region !== "ALL" ? (
            <button type="button" className="inline-flex min-h-11 items-center rounded-full bg-surface px-3 text-sm ring-1 ring-border" onClick={() => go({ region: "ALL", city: "ALL" })}>
              {regionLabel(data.region, data.locale)}
            </button>
          ) : null}
          {data.city !== "ALL" ? (
            <button type="button" className="inline-flex min-h-11 items-center rounded-full bg-surface px-3 text-sm ring-1 ring-border" onClick={() => go({ city: "ALL" })}>
              {data.city}
            </button>
          ) : null}
          {data.region !== "ALL" || data.city !== "ALL" ? (
            <button type="button" className="inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-primary" onClick={() => go({ region: "ALL", city: "ALL" })}>
              {copy.clearFilters}
            </button>
          ) : null}
        </div>
        </div>

        <div className="mt-6 lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <GovTaskNav locale={data.locale} view={view} onView={setView} />
        <div>
        {view === "overview" ? (
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
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="gov-card-providers">
            <dt className="text-sm text-muted">{copy.cardObserved}</dt>
            <dd className="mt-1 font-display text-2xl">{show(kpis.licensedCentres, data.locale, hidden)}</dd>
            <p className="mt-2 text-base leading-6">{copy.cardObservedNote}</p>
            <p className="mt-1 text-base leading-6">{copy.cardScope}</p>
          </div>
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="gov-card-capacity">
            <dt className="text-sm text-muted">{copy.capacity}</dt>
            <dd className="mt-1 font-display text-2xl">{show(kpis.capacity, data.locale, hidden)}</dd>
            <p className="mt-2 text-base leading-6">{copy.cardCapacityNote}</p>
            <p className="mt-1 text-base leading-6">{copy.cardScope}</p>
          </div>
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="gov-card-vacancies">
            <dt className="text-sm text-muted">{copy.spots}</dt>
            <dd className="mt-1 font-display text-2xl">{kpis.vacancyReporters === 0 ? copy.noReporting : show(kpis.openSpots, data.locale, hidden)}</dd>
            <p className="mt-2 text-base leading-6">{copy.cardVacancyNote}</p>
            <p className="mt-1 text-base leading-6">{copy.cardScope}</p>
          </div>
          <a className="rounded-2xl bg-surface p-4 ring-1 ring-border no-underline" data-ke="gov-card-renewals" href={data.locale === "fr" ? "/fr/gov/compliance" : "/gov/compliance"}>
            <p className="text-sm text-muted">{copy.cardRenewals}</p>
            <p className="mt-1 font-display text-2xl">{copy.notTracked}</p>
            <p className="mt-2 text-base leading-6">{copy.cardRenewalsNote}</p>
          </a>
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="gov-card-findings">
            <dt className="text-sm text-muted">{copy.cardFindings}</dt>
            <dd className="mt-1 font-display text-2xl">{copy.notTracked}</dd>
            <p className="mt-2 text-base leading-6">{copy.cardFindingsNote}</p>
          </div>
          <div className="rounded-2xl bg-surface p-4 ring-1 ring-border" data-ke="gov-card-jobs" id="gov-jobs">
            <dt className="text-sm text-muted">{copy.jobs}</dt>
            <dd className="mt-1 font-display text-2xl">{kpis.jobPosts === 0 ? copy.reportedUnknown : show(kpis.jobPosts, data.locale, hidden)}</dd>
            <p className="mt-2 text-base leading-6">{copy.cardJobsNote}</p>
            <p className="mt-1 text-base leading-6">{copy.cardScope}</p>
          </div>
        </dl>
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

        {view === "marketplace" ? (
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

        {view === "analytics" ? (
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

        {view === "workforce" ? <GovJobShortage province={data.province} locale={data.locale} /> : null}

        {view === "health" ? (
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

        {view === "expiries" ? (
          <section className="mt-2 max-w-2xl space-y-3 text-sm leading-6" data-ke="gov-expiries">
            <h2 className="font-display text-xl">{data.locale === "fr" ? "Échéances et alertes" : "Expiries and alerts"}</h2>
            <p>{data.locale === "fr" ? "Une date de document, une inspection et un permis sont des choses différentes. Une vieille importation n’est pas une preuve que le centre est fermé ou non conforme." : "A document date, an inspection and a licence are different things. An old import is not proof that a centre is closed or non-compliant."}</p>
            <p>{copy.registerNotLoaded}</p>
            <p>{copy.notTracked}</p>
            <LicenceFlags data={data} />
            <p>
              <a className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline" href={complianceHref}>
                {data.locale === "fr" ? "Ouvrir les dates suivies" : "Open tracked dates"}
              </a>
            </p>
          </section>
        ) : null}

        {view === "sources" ? (
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
        </div>
        </div>
      </main>
    </div>
  );
}
