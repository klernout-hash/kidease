import type { SiteOccupancy } from "./org-occupancy.ts";
import { orgCopy } from "./org-occupancy-copy.ts";
import { gapCopy } from "./gap-features.ts";
import { filteredTableCsv } from "./gov/filtered-export.ts";

type CsvSite = Pick<
  SiteOccupancy,
  | "name"
  | "city"
  | "province"
  | "licensedCapacity"
  | "enrolled"
  | "openSpots"
  | "occupancyPercent"
  | "note"
> & {
  requests?: number | null;
  staff?: number | null;
};

export type OrgOccupancyCsvReport = {
  sites: readonly CsvSite[];
  totals: {
    sites: number;
    ready: number;
    occupancyPercent: number | null;
    requests?: number | null;
    staff?: number | null;
    openSpots?: number | null;
  };
};

/** Export the loaded table and displayed summaries, without fetching or calculating. */
export function orgOccupancyCsv(report: OrgOccupancyCsvReport, locale: string): string {
  const copy = orgCopy(locale);
  const gap = gapCopy(locale === "fr" ? "fr" : "en");
  const headers = [
    copy.centre,
    copy.capacity,
    copy.enrolled,
    copy.openSpots,
    gap.orgRequests,
    gap.orgStaff,
    copy.occupancy,
  ];
  const rows: (string | number)[][] = report.sites.map((site) => {
    const location = [site.city, site.province].filter(Boolean).join(", ");
    return [
      [site.name, location].filter(Boolean).join("\n"),
      site.licensedCapacity ?? copy.notConfirmed,
      site.enrolled ?? copy.notConfirmed,
      site.openSpots ?? copy.notConfirmed,
      site.requests ?? copy.notConfirmed,
      site.staff ?? copy.notConfirmed,
      site.occupancyPercent != null
        ? `${site.occupancyPercent}%`
        : site.note === "capacity-missing"
          ? copy.missingCapacity
          : copy.missingEnrolment,
    ];
  });
  rows.push(
    ["", "", "", "", "", "", ""],
    [
      `${copy.total}: ${report.totals.ready} ${copy.readyOf} ${report.totals.sites}`,
      "",
      "",
      "",
      "",
      "",
      report.totals.occupancyPercent != null ? `${report.totals.occupancyPercent}%` : "",
    ],
  );
  if ("requests" in report.totals) {
    rows.push([
      copy.csvSummary,
      "",
      "",
      report.totals.openSpots ?? copy.notConfirmed,
      report.totals.requests ?? copy.notConfirmed,
      report.totals.staff ?? copy.notConfirmed,
      "",
    ]);
  }
  // Keep the existing UTF-8/CSV convention; normalize all line endings before quoting.
  const normalized = rows.map((row) =>
    row.map((value) => (typeof value === "string" ? value.replace(/\r\n?/g, "\n") : value)),
  );
  return `\uFEFF${filteredTableCsv(headers, normalized)}`;
}
