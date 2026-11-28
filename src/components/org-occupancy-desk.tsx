import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { EceJobDesk } from "@/components/ece-job-desk";
import { useSessionDesks } from "@/components/session-desks";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { gapCopy } from "@/lib/gap-features";
import { orgCopy } from "@/lib/org-occupancy-copy";
import { orgOccupancyCsv, type OrgOccupancyCsvReport } from "@/lib/org-occupancy-csv";
import { listOrgOccupancy, setOrgCentre } from "@/lib/server/org-occupancy";
import { useCopy } from "@/lib/use-copy";
import { OwnerOnlyNotice } from "@/components/owner-only-notice";

function downloadCsv(report: OrgOccupancyCsvReport, locale: string) {
  const url = URL.createObjectURL(
    new Blob([orgOccupancyCsv(report, locale)], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "kidease-centre-occupancy.csv";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function OccupancyOwnerOnly() {
  return <OwnerOnlyNotice />;
}

export function OrgOccupancyDesk() {
  const { locale } = useCopy();
  const { session, ready } = useSessionDesks();
  if (!ready) return <p className="text-sm text-muted">{orgCopy(locale).lead}</p>;
  if (session?.centreRole !== "owner") return <OccupancyOwnerOnly />;
  return <OwnerOccupancyDesk key={session.email ?? undefined} />;
}

function OwnerOccupancyDesk() {
  const { locale } = useCopy();
  const copy = orgCopy(locale);
  const gap = gapCopy(locale === "fr" ? "fr" : "en");
  const [desk, setDesk] = useState<Awaited<ReturnType<typeof listOrgOccupancy>> | null>(null);
  useEffect(() => {
    void listOrgOccupancy()
      .then(setDesk)
      .catch(() =>
        setDesk({
          enabled: false,
          sites: [],
          totals: { sites: 0, ready: 0, capacity: null, enrolled: null, occupancyPercent: null },
        }),
      );
  }, []);
  if (!desk) return <p className="text-sm text-muted">{copy.lead}</p>;
  if ("denied" in desk && desk.denied) return <OccupancyOwnerOnly />;
  if (!desk.enabled)
    return (
      <EmptyState
        title={copy.offTitle}
        body={copy.offBody}
        action={copy.home}
        actionTo="/provider"
      />
    );
  const columns = [copy.capacity, copy.enrolled, copy.openSpots, gap.orgRequests, gap.orgStaff, copy.occupancy];
  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">{copy.title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">{copy.lead}</p>
      </div>
      {desk.sites.length === 0 ? (
        <p className="text-sm text-muted">{copy.empty}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              {copy.total}: {desk.totals.ready} {copy.readyOf} {desk.totals.sites}
              {desk.totals.occupancyPercent != null
                ? `. ${copy.occupancy} ${desk.totals.occupancyPercent}%`
                : ""}
            </p>
            <Button type="button" variant="secondary" onClick={() => downloadCsv(desk, locale)}>
              {copy.downloadCsv}
            </Button>
          </div>
          <div className="max-w-full rounded-xl bg-surface ring-1 ring-border md:overflow-x-auto" role="region" aria-label={copy.title} tabIndex={0}>
            <table role="table" className="w-full text-sm max-md:block md:min-w-[32rem]">
              <thead className="bg-surface-2 text-left text-xs text-muted max-md:sr-only">
                <tr>
                  {[copy.centre, ...columns].map((column) => (
                    <th key={column} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody role="rowgroup" className="divide-y divide-border max-md:block">
                {desk.sites.map((site) => {
                  const values = [
                    site.licensedCapacity ?? copy.notConfirmed,
                    site.enrolled ?? copy.notConfirmed,
                    site.openSpots ?? copy.notConfirmed,
                    ("requests" in site ? site.requests : null) ?? copy.notConfirmed,
                    ("staff" in site ? site.staff : null) ?? copy.notConfirmed,
                    site.occupancyPercent != null
                      ? `${site.occupancyPercent}%`
                      : site.note === "capacity-missing" ? copy.missingCapacity : copy.missingEnrolment,
                  ];
                  return (
                    <tr role="row" key={site.id} className="max-md:grid max-md:grid-cols-2 max-md:gap-x-2 max-md:p-2">
                      <td role="cell" className="px-3 py-3 max-md:col-span-2">
                        <p className="font-medium">{site.name}</p>
                        <p className="text-muted">
                          {[site.city, site.province].filter(Boolean).join(", ")}
                        </p>
                        <Link
                          to="/provider"
                          search={{ desk: "today", centre: site.id }}
                          className="mt-1 inline-flex min-h-11 items-center text-sm font-medium text-primary"
                          onClick={() =>
                            void setOrgCentre({ data: { daycareId: site.id } }).catch(() => undefined)
                          }
                        >
                          {gap.orgUse}
                        </Link>
                      </td>
                      {values.map((value, index) => (
                        <td role="cell" key={columns[index]} className="min-w-0 px-3 py-2 tabular-nums md:py-3">
                          <span aria-hidden="true" className="block text-xs text-muted md:hidden">{columns[index]}</span>
                          {value}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {"requests" in desk.totals ? (
            <p className="text-sm text-muted">
              {gap.orgRequests}: {desk.totals.requests ?? copy.notConfirmed}
              {" · "}
              {gap.orgStaff}: {desk.totals.staff ?? copy.notConfirmed}
              {" · "}
              {gap.orgSpots}: {desk.totals.openSpots ?? copy.notConfirmed}
            </p>
          ) : null}
        </>
      )}
      <EceJobDesk mode="org" />
    </section>
  );
}
