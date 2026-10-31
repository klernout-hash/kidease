import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { GovDashboard } from "@/lib/gov/aggregate";
import { govCopy, govPath } from "@/lib/gov/copy";
import { regionLabel } from "@/lib/gov/places";
import { GovHelp } from "@/components/gov/gov-help";
import { GovMap } from "@/components/gov/gov-map";
import { signOut } from "@/lib/auth/client";

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

export function GovDashboardView({ data }: { data: GovDashboard }) {
  const copy = govCopy(data.locale);
  const hidden = copy.suppressed;
  const navigate = useNavigate();
  const path = useRouterState({ select: (state) => state.location.pathname });
  const other = data.locale === "fr" ? "en" : "fr";
  const query = new URLSearchParams();
  if (data.province) query.set("province", data.province);
  if (data.region && data.region !== "ALL") query.set("region", data.region);
  if (data.city && data.city !== "ALL") query.set("city", data.city);
  const exportBase = `/api/gov/export?${query.toString()}`;

  function go(next: { province?: string; region?: string; city?: string }) {
    void navigate({
      to: path,
      search: {
        province: next.province ?? data.province,
        region: next.region ?? "ALL",
        city: next.city ?? "ALL",
      },
    });
  }

  const kpis = data.kpis;
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
        {data.demo ? <p className="mt-3 rounded-2xl bg-surface px-4 py-3 text-sm ring-1 ring-border">{copy.demo}</p> : null}

        <form className="mt-6 grid gap-3 sm:grid-cols-3" onSubmit={(event) => event.preventDefault()}>
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
              value={data.region}
              onChange={(event) => go({ region: event.target.value, city: "ALL" })}
            >
              {data.selectors.regions.map((region) => (
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
              value={data.city}
              onChange={(event) => go({ city: event.target.value })}
            >
              {data.selectors.cities.map((city) => (
                <option key={city} value={city}>
                  {city === "ALL" ? (data.locale === "fr" ? "Toutes les villes" : "All cities") : city}
                </option>
              ))}
            </select>
          </label>
        </form>

        <div className="mt-6 flex flex-wrap gap-3">
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

        <dl className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi label={copy.licensed} value={show(kpis.licensedCentres, data.locale, hidden)} />
          <Kpi label={copy.directory} value={show(kpis.directoryCentres, data.locale, hidden)} />
          <Kpi label={copy.capacity} value={show(kpis.capacity, data.locale, hidden)} />
          <Kpi label={copy.reporters} value={show(kpis.vacancyReporters, data.locale, hidden)} />
          <Kpi label={copy.fresh} value={show(kpis.vacancyFresh30, data.locale, hidden)} />
          <Kpi label={copy.spots} value={show(kpis.openSpots, data.locale, hidden)} />
          <Kpi label={copy.fill} value={kpis.avgFillDays == null ? copy.fillMissing : show(kpis.avgFillDays, data.locale, hidden)} />
          <Kpi label={copy.feesConfirmed} value={show(kpis.feesConfirmedCentres, data.locale, hidden)} />
          <Kpi label={copy.feesUncited} value={show(kpis.feesUncitedCentres, data.locale, hidden)} />
          <Kpi label={copy.program} value={show(kpis.cwelccKnown, data.locale, hidden)} />
          <Kpi label={copy.programUnknown} value={show(kpis.cwelccUnknown, data.locale, hidden)} />
          <Kpi label={copy.french} value={show(kpis.frenchCentres, data.locale, hidden)} />
          <Kpi label={copy.english} value={show(kpis.englishCentres, data.locale, hidden)} />
          <Kpi label={copy.inclusion} value={show(kpis.inclusionCentres, data.locale, hidden)} />
          <Kpi label={copy.jobs} value={show(kpis.jobPosts, data.locale, hidden)} />
          <Kpi
            label={copy.desert}
            value={
              data.desert.perSpace != null
                ? show(data.desert.perSpace, data.locale, hidden)
                : data.desert.population == null
                  ? copy.desertMissing
                  : copy.desertNoSpaces
            }
          />
        </dl>
        {data.hiddenAreas > 0 ? (
          <p className="mt-3 text-sm text-muted">
            {show(data.hiddenAreas, data.locale, hidden)} {copy.hidden}
          </p>
        ) : null}

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

        <section className="mt-8" aria-labelledby="gov-fees-title">
          <h2 id="gov-fees-title" className="font-display text-xl">
            {copy.fees}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.fees
              .filter((row) => !row.suppressed)
              .map((row) => (
                <li key={`${row.kind}-${row.bucket}`}>
                  {row.kind === "confirmed" ? copy.feesConfirmed : copy.feesUncited}: {row.bucket} — {show(row.centres, data.locale, hidden)}
                </li>
              ))}
          </ul>
        </section>

        <section className="mt-8" aria-labelledby="gov-wait-title">
          <h2 id="gov-wait-title" className="font-display text-xl">
            {copy.waitlist}
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.waitlist
              .filter((row) => !row.suppressed)
              .map((row) => (
                <li key={`${row.age}-${row.start}`}>
                  {copy.age}: {row.age}. {copy.start}: {row.start || "—"}. {copy.count}: {show(row.n, data.locale, hidden)}
                </li>
              ))}
          </ul>
        </section>

        <section className="mt-8" aria-labelledby="gov-trend-title">
          <h2 id="gov-trend-title" className="font-display text-xl">
            {copy.trends}
          </h2>
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
      </main>
    </div>
  );
}
