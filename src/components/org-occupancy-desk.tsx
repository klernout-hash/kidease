import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { orgCopy } from "@/lib/org-occupancy-copy";
import { listOrgOccupancy, orgDeskStatus } from "@/lib/server/org-occupancy";
import { useCopy } from "@/lib/use-copy";

export function OrgDeskLink() {
  const { locale } = useCopy();
  const copy = orgCopy(locale);
  const [on, setOn] = useState(false);
  useEffect(() => {
    void orgDeskStatus().then((row) => setOn(row.enabled)).catch(() => setOn(false));
  }, []);
  if (!on) return null;
  return (
    <p className="mb-4">
      <Link to="/provider" search={{ desk: "sites" }} className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline">
        {copy.title}
      </Link>
    </p>
  );
}

export function OrgOccupancyDesk() {
  const { locale } = useCopy();
  const copy = orgCopy(locale);
  const [desk, setDesk] = useState<Awaited<ReturnType<typeof listOrgOccupancy>> | null>(null);
  useEffect(() => {
    void listOrgOccupancy().then(setDesk).catch(() => setDesk({ enabled: false, sites: [], totals: { sites: 0, ready: 0, capacity: null, enrolled: null, occupancyPercent: null } }));
  }, []);
  if (!desk) return <p className="text-sm text-muted">{copy.lead}</p>;
  if (!desk.enabled) return <EmptyState title={copy.offTitle} body={copy.offBody} action={copy.home} actionTo="/provider" />;
  return (
    <section className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">{copy.title}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">{copy.lead}</p>
      </div>
      {desk.sites.length === 0 ? <p className="text-sm text-muted">{copy.empty}</p> : (
        <>
          <p className="text-sm">
            {copy.total}: {desk.totals.ready} {copy.readyOf} {desk.totals.sites}
            {desk.totals.occupancyPercent != null ? `. ${copy.occupancy} ${desk.totals.occupancyPercent}%` : ""}
          </p>
          <div className="overflow-x-auto rounded-xl bg-surface ring-1 ring-border">
            <table className="w-full min-w-[32rem] text-sm">
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>
                  <th className="px-3 py-2 font-medium">{copy.centre}</th>
                  <th className="px-3 py-2 font-medium">{copy.capacity}</th>
                  <th className="px-3 py-2 font-medium">{copy.enrolled}</th>
                  <th className="px-3 py-2 font-medium">{copy.openSpots}</th>
                  <th className="px-3 py-2 font-medium">{copy.occupancy}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {desk.sites.map((site) => (
                  <tr key={site.id}>
                    <td className="px-3 py-3">
                      <p className="font-medium">{site.name}</p>
                      <p className="text-muted">{[site.city, site.province].filter(Boolean).join(", ")}</p>
                    </td>
                    <td className="px-3 py-3 tabular-nums">{site.licensedCapacity ?? copy.notConfirmed}</td>
                    <td className="px-3 py-3 tabular-nums">{site.enrolled ?? copy.notConfirmed}</td>
                    <td className="px-3 py-3 tabular-nums">{site.openSpots ?? copy.notConfirmed}</td>
                    <td className="px-3 py-3">
                      {site.occupancyPercent != null ? `${site.occupancyPercent}%` : site.note === "capacity-missing" ? copy.missingCapacity : copy.missingEnrolment}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
