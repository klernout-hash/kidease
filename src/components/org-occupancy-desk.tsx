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
          <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-border">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">{copy.centre}</th>
                  <th className="px-3 py-2 font-medium">{copy.capacity}</th>
                  <th className="px-3 py-2 font-medium">{copy.enrolled}</th>
                  <th className="px-3 py-2 font-medium">{copy.openSpots}</th>
                  <th className="px-3 py-2 font-medium">{gap.orgRequests}</th>
                  <th className="px-3 py-2 font-medium">{gap.orgStaff}</th>
                  <th className="px-3 py-2 font-medium">{copy.occupancy}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {desk.sites.map((site) => (
                  <tr key={site.id}>
                    <td className="px-3 py-3">
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
                    <td className="px-3 py-3 tabular-nums">
                      {site.licensedCapacity ?? copy.notConfirmed}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{site.enrolled ?? copy.notConfirmed}</td>
                    <td className="px-3 py-3 tabular-nums">
                      {site.openSpots ?? copy.notConfirmed}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {"requests" in site
                        ? (site.requests ?? copy.notConfirmed)
                        : copy.notConfirmed}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {"staff" in site ? (site.staff ?? copy.notConfirmed) : copy.notConfirmed}
                    </td>
                    <td className="px-3 py-3">
                      {site.occupancyPercent != null
                        ? `${site.occupancyPercent}%`
                        : site.note === "capacity-missing"
                          ? copy.missingCapacity
                          : copy.missingEnrolment}
                    </td>
                  </tr>
                ))}
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
