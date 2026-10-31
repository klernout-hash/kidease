/**
 * Provincial licensing exports. FEATURE_PROVINCE_REPORTS defaults off.
 * Manitoba and Ontario have their own columns. Everyone else gets a generic file.
 * Blank cells stay blank. KidEase does not invent a space count.
 */
import { provinceReportsEnabled, type EnvMap } from "./features.ts";

export const PROVINCE_REPORT_FORMATS = ["csv", "pdf"] as const;
export type ProvinceReportFormat = (typeof PROVINCE_REPORT_FORMATS)[number];

export type ProvinceReportRow = {
  licence?: string | null;
  name?: string | null;
  city?: string | null;
  postal?: string | null;
  province?: string | null;
  licensedSpaces?: number | null;
  openSpots?: number | null;
};

export type ProvinceTemplate = "MB" | "ON" | "generic";

export function provinceTemplate(code: string | null | undefined): ProvinceTemplate {
  const province = String(code || "").trim().toUpperCase();
  if (province === "MB") return "MB";
  if (province === "ON") return "ON";
  return "generic";
}

export function reportProvinceAllowed(input: {
  role?: string | null;
  requested: string;
  govProvince?: string | null;
  govScopesOn?: boolean;
}): boolean {
  const role = String(input.role || "").trim().toLowerCase();
  const requested = String(input.requested || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(requested)) return false;
  if (role === "admin") return true;
  if (role !== "government" || !input.govScopesOn) return false;
  return String(input.govProvince || "").trim().toUpperCase() === requested;
}

function cell(value: string | number | null | undefined): string {
  if (value == null || value === "") return "";
  return String(value);
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function headersFor(template: ProvinceTemplate): string[] {
  if (template === "MB") {
    return ["Licence number", "Facility name", "City", "Postal code", "Licensed spaces", "Open spots", "Report date"];
  }
  if (template === "ON") {
    return ["Licence number", "Program name", "Municipality", "Postal code", "Licensed capacity", "Vacancies", "As of"];
  }
  return ["Licence", "Name", "City", "Province", "Postal code", "Open spots"];
}

function rowFor(template: ProvinceTemplate, row: ProvinceReportRow, reportDate: string): string[] {
  const spaces = row.licensedSpaces == null || !Number.isFinite(row.licensedSpaces) ? "" : String(row.licensedSpaces);
  const spots = row.openSpots == null || !Number.isFinite(row.openSpots) ? "" : String(row.openSpots);
  if (template === "MB" || template === "ON") {
    return [cell(row.licence), cell(row.name), cell(row.city), cell(row.postal), spaces, spots, reportDate];
  }
  return [cell(row.licence), cell(row.name), cell(row.city), cell(row.province), cell(row.postal), spots];
}

export function buildProvinceCsv(province: string, rows: readonly ProvinceReportRow[], reportDate: string): string {
  const template = provinceTemplate(province);
  const lines = [headersFor(template).map(csvCell).join(",")];
  for (const row of rows) lines.push(rowFor(template, row, reportDate).map(csvCell).join(","));
  if (rows.length === 0) lines.push(csvCell("No centres in this export"));
  return `${lines.join("\n")}\n`;
}

function pdfEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function simplePdf(lines: readonly string[]): string {
  const commands = ["BT", "/F1 9 Tf", "40 760 Td", "12 TL"];
  for (const line of lines.slice(0, 55)) {
    const safe = pdfEscape(line).slice(0, 140);
    commands.push(`(${safe}) Tj`, "T*");
  }
  commands.push("ET");
  const stream = commands.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Count 1 /Kids [3 0 R] >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj ${obj} endobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return body;
}

export function buildProvinceReport(input: {
  province: string;
  rows: readonly ProvinceReportRow[];
  format: ProvinceReportFormat;
  reportDate: string;
  enabled?: boolean;
  env?: EnvMap;
}):
  | { ok: false; reason: "off" | "province" | "format" }
  | { ok: true; filename: string; contentType: string; body: string; template: ProvinceTemplate } {
  const enabled = input.enabled ?? provinceReportsEnabled(input.env);
  if (!enabled) return { ok: false, reason: "off" };
  const province = String(input.province || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(province)) return { ok: false, reason: "province" };
  if (input.format !== "csv" && input.format !== "pdf") return { ok: false, reason: "format" };
  const template = provinceTemplate(province);
  const date = String(input.reportDate || "").slice(0, 10);
  if (input.format === "csv") {
    return {
      ok: true,
      filename: `kidease-${province.toLowerCase()}-licensing.csv`,
      contentType: "text/csv; charset=utf-8",
      body: buildProvinceCsv(province, input.rows, date),
      template,
    };
  }
  const header = headersFor(template).join(" | ");
  const lines = [
    `KidEase licensing export · ${province}`,
    template === "generic" ? "Generic columns. This province does not have its own template yet." : `${template} template.`,
    "Open spots are the numbers saved on the listing. A blank cell was not on file.",
    header,
    ...input.rows.slice(0, 40).map((row) => rowFor(template, row, date).join(" | ")),
  ];
  if (input.rows.length === 0) lines.push("No centres in this export.");
  if (input.rows.length > 40) lines.push(`PDF shows 40 of ${input.rows.length} rows. Download CSV for the full list.`);
  return {
    ok: true,
    filename: `kidease-${province.toLowerCase()}-licensing.pdf`,
    contentType: "application/pdf",
    body: simplePdf(lines),
    template,
  };
}
