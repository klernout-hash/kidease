import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { providerDeskPath } from "@/lib/desk-nav";
import { fillInsight, insightsCopy, type InsightsCopy } from "@/lib/provider-insights-copy";
import {
  INSIGHT_RANGES,
  type InsightPoint,
  type InsightRange,
  type ProviderInsightsModel,
} from "@/lib/provider-insights";
import { loadProviderInsights, type ProviderInsightsResult } from "@/lib/server/provider-insights";
import { useCopy } from "@/lib/use-copy";

const RANGE_LABEL: Record<InsightRange, keyof InsightsCopy> = {
  "7d": "range7",
  "30d": "range30",
  "90d": "range90",
  "12m": "range12",
};

function formatPercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}%` : `${rounded.toFixed(1)}%`;
}

function replyText(hours: number, copy: InsightsCopy): string {
  if (hours < 1) return copy.underHour;
  if (hours < 48) {
    const n = Math.round(hours * 10) / 10;
    if (n === 1) return copy.oneHour;
    return fillInsight(copy.hours, { n });
  }
  return fillInsight(copy.days, { n: Math.round((hours / 24) * 10) / 10 });
}

function pointLabel(key: string, locale: string): string {
  const loc = locale === "fr" ? "fr-CA" : "en-CA";
  const iso = key.length === 7 ? `${key}-01` : key.slice(0, 10);
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat(loc, {
    month: "short",
    day: key.length === 7 ? undefined : "numeric",
    timeZone: "UTC",
  }).format(date);
}

function ageLabel(age: string, copy: InsightsCopy): string {
  if (age === "infant") return copy.ageInfant;
  if (age === "toddler") return copy.ageToddler;
  if (age === "preschool") return copy.agePreschool;
  return copy.ageAny;
}

function InsightBars({
  label,
  points,
  labels,
  maxHint,
  empty,
}: {
  label: string;
  points: InsightPoint[];
  labels: string[];
  maxHint?: number;
  empty: string;
}) {
  if (!points.length || points.every((point) => point.value <= 0)) {
    return <p className="text-sm text-muted">{empty}</p>;
  }
  const max = Math.max(maxHint ?? 0, ...points.map((point) => point.value), 0.1);
  const first = labels[0] ?? "";
  const mid = labels[Math.floor(labels.length / 2)] ?? "";
  const last = labels[labels.length - 1] ?? "";
  return (
    <figure className="min-w-0">
      <figcaption className="text-sm font-medium">{label}</figcaption>
      <div className="mt-2 flex h-24 items-end gap-px" role="img" aria-label={label}>
        {points.map((point, index) => {
          const height = Math.max(4, Math.round((point.value / max) * 100));
          return (
            <div key={point.key} className="flex h-full min-w-0 flex-1 items-end">
              <div
                className="w-full rounded-t-sm bg-primary"
                style={{ height: `${height}%` }}
                title={`${labels[index] ?? point.key}: ${point.value}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between gap-2 text-xs text-muted">
        <span>{first}</span>
        {points.length > 2 ? <span>{mid}</span> : null}
        <span>{last}</span>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {points.map((point, index) => (
            <tr key={point.key}>
              <th scope="row">{labels[index] ?? point.key}</th>
              <td>{point.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-bg px-3 py-3 ring-1 ring-border">
      <p className="text-sm leading-5 text-muted">{label}</p>
      <p className="mt-1 break-words font-display text-2xl tabular-nums tracking-tight">{value}</p>
    </div>
  );
}

function Section({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl bg-surface p-4 ring-1 ring-border">
      <h2 className="font-display text-xl tracking-tight">{title}</h2>
      <p className="mt-1 text-sm leading-5 text-muted">{body}</p>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function DeskForward({
  desk,
  children,
}: {
  desk: "today" | "listings" | "tours" | "requests";
  children: string;
}) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <Link
      to={providerDeskPath(pathname)}
      search={{ desk }}
      className="inline-flex min-h-11 items-center font-medium text-primary"
    >
      {children}
    </Link>
  );
}

function InsightsBody({
  data,
  copy,
  locale,
}: {
  data: ProviderInsightsModel;
  copy: InsightsCopy;
  locale: string;
}) {
  const labels = (points: InsightPoint[]) => points.map((point) => pointLabel(point.key, locale));
  const loc = locale === "fr" ? "fr-CA" : "en-CA";
  return (
    <div className="space-y-4">
      <Section title={copy.listingTitle} body={copy.listingBody}>
        {data.listing.empty ? (
          <div>
            <p className="text-sm leading-5">{copy.listingEmpty}</p>
            <DeskForward desk="listings">{copy.openListings}</DeskForward>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label={copy.views} value={String(data.listing.views)} />
              <Stat label={copy.saves} value={String(data.listing.saves)} />
              <Stat label={copy.inquiries} value={String(data.listing.inquiries)} />
              <Stat label={copy.requests} value={String(data.listing.requests)} />
            </div>
            <p className="text-sm leading-5">
              <span className="font-medium">{copy.conversion}. </span>
              {data.listing.conversion == null
                ? copy.conversionNone
                : fillInsight(copy.conversionValue, {
                    requests: data.listing.requests,
                    views: data.listing.views,
                    pct: formatPercent(data.listing.conversion),
                  })}
            </p>
            <InsightBars
              label={copy.viewsChart}
              points={data.listing.viewSeries}
              labels={labels(data.listing.viewSeries)}
              empty={copy.chartEmpty}
            />
            <InsightBars
              label={copy.requestsChart}
              points={data.listing.requestSeries}
              labels={labels(data.listing.requestSeries)}
              empty={copy.chartEmpty}
            />
          </>
        )}
      </Section>

      <Section title={copy.responseTitle} body={copy.responseBody}>
        {data.response.empty ? (
          <div>
            <p className="text-sm leading-5">{copy.noReply}</p>
            <DeskForward desk="today">{copy.home}</DeskForward>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Stat
              label={copy.yourReply}
              value={
                data.response.medianHours == null
                  ? copy.noReply
                  : replyText(data.response.medianHours, copy)
              }
            />
            <Stat
              label={copy.areaReply}
              value={
                data.response.areaMedianHours == null
                  ? "—"
                  : replyText(data.response.areaMedianHours, copy)
              }
            />
          </div>
        )}
        {data.response.sample > 0 ? (
          <p className="text-sm text-muted">
            {fillInsight(copy.replies, { n: data.response.sample })}
          </p>
        ) : null}
        <p className="text-sm leading-5 text-muted">
          {data.response.areaCity
            ? fillInsight(copy.areaNote, { city: data.response.areaCity })
            : copy.areaHidden}
        </p>
      </Section>

      <Section title={copy.waitTitle} body={copy.waitBody}>
        {data.waitlist.empty ? (
          <div>
            <p className="text-sm leading-5">{copy.waitEmpty}</p>
            <DeskForward desk="requests">{copy.openRequests}</DeskForward>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label={copy.waitCount} value={String(data.waitlist.total)} />
              <Stat
                label={copy.avgWait}
                value={
                  data.waitlist.avgWaitDays == null
                    ? "—"
                    : fillInsight(copy.daysShort, { n: data.waitlist.avgWaitDays })
                }
              />
            </div>
            <ul className="space-y-2">
              {data.waitlist.groups.map((group) => (
                <li
                  key={group.age}
                  className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                >
                  <span>{ageLabel(group.age, copy)}</span>
                  <span className="tabular-nums">
                    {group.count}
                    {group.avgWaitDays == null
                      ? ""
                      : ` · ${fillInsight(copy.daysShort, { n: group.avgWaitDays })}`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section title={copy.enrolTitle} body={copy.enrolBody}>
        {data.occupancy.empty ? (
          <div>
            <p className="text-sm leading-5">{copy.enrolEmpty}</p>
            <DeskForward desk="listings">{copy.updateListings}</DeskForward>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <Stat label={copy.enrolled} value={String(data.occupancy.enrolled)} />
              <Stat
                label={copy.capacity}
                value={data.occupancy.capacity == null ? "—" : String(data.occupancy.capacity)}
              />
              <Stat
                label={copy.openSpots}
                value={data.occupancy.openTotal == null ? "—" : String(data.occupancy.openTotal)}
              />
            </div>
            {data.occupancy.capacity == null ? (
              <p className="text-sm text-muted">{copy.capacityMissing}</p>
            ) : null}
            {data.occupancy.capacity != null &&
            data.occupancy.capacityCentres < data.occupancy.centreCount ? (
              <p className="text-sm text-muted">
                {fillInsight(copy.capacityPartial, {
                  known: data.occupancy.capacityCentres,
                  total: data.occupancy.centreCount,
                })}
              </p>
            ) : null}
            {data.occupancy.openTotal == null ? (
              <p className="text-sm text-muted">{copy.spotsMissing}</p>
            ) : null}
            {data.occupancy.openTotal != null &&
            data.occupancy.openCentres < data.occupancy.centreCount ? (
              <p className="text-sm text-muted">
                {fillInsight(copy.spotsPartial, {
                  known: data.occupancy.openCentres,
                  total: data.occupancy.centreCount,
                })}
              </p>
            ) : null}
            {data.occupancy.openByAge ? (
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {data.occupancy.openByAge.map((row) => (
                  <li
                    key={row.age}
                    className="rounded-lg bg-bg px-3 py-2 text-sm ring-1 ring-border"
                  >
                    <span className="text-muted">{ageLabel(row.age, copy)}</span>
                    <span className="mt-1 block font-display text-xl tabular-nums">
                      {row.spots}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <InsightBars
              label={copy.enrolChart}
              points={data.occupancy.enrolmentSeries}
              labels={labels(data.occupancy.enrolmentSeries)}
              empty={copy.chartEmpty}
            />
            {data.occupancy.openSeries.length ? (
              <InsightBars
                label={copy.openChart}
                points={data.occupancy.openSeries}
                labels={labels(data.occupancy.openSeries)}
                empty={copy.chartEmpty}
              />
            ) : null}
          </>
        )}
      </Section>

      <Section title={copy.tourTitle} body={copy.tourBody}>
        {data.tours.empty ? (
          <div>
            <p className="text-sm leading-5">{copy.tourEmpty}</p>
            <DeskForward desk="tours">{copy.tourTimes}</DeskForward>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label={copy.tourAsked} value={String(data.tours.requested)} />
              <Stat label={copy.booked} value={String(data.tours.booked)} />
              <Stat
                label={copy.showRate}
                value={data.tours.showRate == null ? "—" : formatPercent(data.tours.showRate)}
              />
              <Stat
                label={copy.tourEnrol}
                value={data.tours.enrolRate == null ? "—" : formatPercent(data.tours.enrolRate)}
              />
            </div>
            {data.tours.showRate == null ? (
              <p className="text-sm text-muted">{copy.showUnknown}</p>
            ) : null}
          </>
        )}
      </Section>

      <Section title={copy.attendTitle} body={copy.attendBody}>
        {data.attendance.empty ? (
          <div>
            <p className="text-sm leading-5">{copy.attendEmpty}</p>
            <DeskForward desk="today">{copy.home}</DeskForward>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat label={copy.present} value={String(data.attendance.records)} />
              <Stat label={copy.checkIns} value={String(data.attendance.checkIns)} />
            </div>
            <InsightBars
              label={copy.attendChart}
              points={data.attendance.series}
              labels={labels(data.attendance.series)}
              empty={copy.chartEmpty}
            />
          </>
        )}
      </Section>

      <Section title={copy.staffTitle} body={copy.staffBody}>
        {data.staff.empty ? (
          <div>
            <p className="text-sm leading-5">{copy.staffEmpty}</p>
            <DeskForward desk="today">{copy.home}</DeskForward>
          </div>
        ) : (
          <>
            {data.staff.ratioSeries.length ? (
              <InsightBars
                label={copy.ratioChart}
                points={data.staff.ratioSeries}
                labels={labels(data.staff.ratioSeries)}
                empty={copy.ratioEmpty}
              />
            ) : (
              <p className="text-sm text-muted">{copy.ratioEmpty}</p>
            )}
            <div>
              <h3 className="text-sm font-medium">{copy.certTitle}</h3>
              {data.staff.certs.length ? (
                <ul className="mt-2 space-y-2">
                  {data.staff.certs.map((cert) => (
                    <li key={`${cert.staffName}:${cert.expiresOn}`} className="text-sm leading-5">
                      <span className="font-medium">{cert.staffName}</span>
                      {cert.level ? <span className="text-muted"> · {cert.level}</span> : null}
                      <span className="mt-0.5 block text-muted">
                        {fillInsight(copy.expires, {
                          date: new Intl.DateTimeFormat(loc, {
                            dateStyle: "medium",
                            timeZone: "UTC",
                          }).format(new Date(`${cert.expiresOn}T00:00:00Z`)),
                        })}
                        {" · "}
                        {fillInsight(copy.daysLeft, { n: cert.daysLeft })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-sm text-muted">
                  {data.staff.certsOnFile ? copy.certEmpty : copy.certNone}
                </p>
              )}
            </div>
          </>
        )}
      </Section>

      <Section title={copy.reviewsTitle} body={copy.reviewsBody}>
        {data.reviews.empty ? (
          <div>
            <p className="text-sm leading-5">{copy.reviewsEmpty}</p>
            <DeskForward desk="today">{copy.home}</DeskForward>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label={copy.average}
                value={data.reviews.average == null ? "—" : String(data.reviews.average)}
              />
              <Stat label={copy.reviewCount} value={String(data.reviews.count)} />
            </div>
            <InsightBars
              label={copy.reviewChart}
              points={data.reviews.series}
              labels={labels(data.reviews.series)}
              maxHint={5}
              empty={copy.chartEmpty}
            />
          </>
        )}
      </Section>
    </div>
  );
}

export function ProviderInsightsDesk() {
  const { locale } = useCopy();
  const copy = insightsCopy(locale);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const [range, setRange] = useState<InsightRange>("30d");
  const [centreId, setCentreId] = useState("all");
  const [result, setResult] = useState<ProviderInsightsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    setLoading(true);
    void loadProviderInsights({ data: { range, centreId } })
      .then((row) => {
        if (live) setResult(row);
      })
      .catch(() => {
        if (live) setResult({ enabled: true, error: "load", centreId, centreOptions: [] });
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [range, centreId, attempt]);

  const options = result && result.enabled && "centreOptions" in result ? result.centreOptions : [];
  const off = result != null && !result.enabled;

  useEffect(() => {
    if (result && result.enabled && result.error === "not_yours" && centreId !== "all")
      setCentreId("all");
  }, [result, centreId]);

  return (
    <div className="min-w-0 space-y-4" data-ke="provider-insights">
      <header>
        <h1 className="font-display text-2xl tracking-tight sm:text-3xl">{copy.title}</h1>
        <p className="mt-1 max-w-prose text-sm leading-5 text-muted">{copy.lead}</p>
        {off ? null : <p className="mt-1 text-sm leading-5">{copy.next}</p>}
      </header>

      {off ? null : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div role="radiogroup" aria-label={copy.rangeLabel} className="flex flex-wrap gap-2">
            {INSIGHT_RANGES.map((id) => (
              <Button
                key={id}
                type="button"
                role="radio"
                aria-checked={range === id}
                variant="outline"
                size="md"
                className={
                  range === id
                    ? "min-w-11 whitespace-normal ring-2 ring-primary"
                    : "min-w-11 whitespace-normal"
                }
                onClick={() => setRange(id)}
              >
                {copy[RANGE_LABEL[id]]}
              </Button>
            ))}
          </div>
          {options.length > 1 ? (
            <label className="block min-w-0 flex-1 text-sm font-medium" htmlFor="insights-centre">
              {copy.centreLabel}
              <select
                id="insights-centre"
                className="mt-1 h-11 w-full rounded-md border border-border bg-bg px-3"
                value={centreId}
                onChange={(event) => setCentreId(event.target.value)}
              >
                <option value="all">{copy.allCentres}</option>
                {options.map((centre) => (
                  <option key={centre.id} value={centre.id}>
                    {centre.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      )}

      {loading && !result ? (
        <p role="status" aria-live="polite" className="text-sm text-muted">
          {copy.loading}
        </p>
      ) : null}

      {result && !result.enabled ? (
        <EmptyState
          icon={BarChart3}
          title={copy.offTitle}
          body={copy.offBody}
          action={copy.home}
          actionTo={`${providerDeskPath(pathname)}?desk=today`}
        />
      ) : null}

      {result && result.enabled && result.error === "load" ? (
        <div role="alert">
          <EmptyState
            icon={BarChart3}
            title={copy.errorTitle}
            body={copy.errorBody}
            action={copy.retry}
            onAction={() => setAttempt((n) => n + 1)}
          />
        </div>
      ) : null}

      {result && result.enabled && result.error === "not_yours" ? (
        <p role="alert" className="text-sm">
          {copy.notYours}
        </p>
      ) : null}

      {result && result.enabled && !result.error && result.data.centres.length === 0 ? (
        <EmptyState
          icon={BarChart3}
          title={copy.claimTitle}
          body={copy.claimBody}
          action={copy.claim}
          actionTo="/claim"
        />
      ) : null}

      {result && result.enabled && !result.error && result.data.centres.length > 0 ? (
        <InsightsBody data={result.data} copy={copy} locale={locale} />
      ) : null}

      {loading && result ? (
        <p role="status" aria-live="polite" className="sr-only">
          {copy.loading}
        </p>
      ) : null}
    </div>
  );
}
