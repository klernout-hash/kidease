/**
 * CSV and PDF lines for the rows a government table is showing.
 * Suppressed cells stay blank. No personal fields are added here.
 */

export type ExportCell = string | number | null | undefined;

function cell(value: ExportCell): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function filteredTableCsv(headers: readonly string[], rows: readonly (readonly ExportCell[])[]): string {
  const lines = [headers.map(cell).join(",")];
  for (const row of rows) lines.push(headers.map((_, index) => cell(row[index])).join(","));
  return `${lines.join("\n")}\n`;
}

export function filteredTablePdfLines(
  title: string,
  headers: readonly string[],
  rows: readonly (readonly ExportCell[])[],
): string[] {
  const lines = [title, headers.join(" | ")];
  const shown = rows.slice(0, 80);
  for (const row of shown) {
    lines.push(headers.map((_, index) => cell(row[index]) || "—").join(" | "));
  }
  if (rows.length > shown.length) lines.push(`PDF shows ${shown.length} of ${rows.length} rows. Download CSV for the full list.`);
  if (rows.length === 0) lines.push("No rows in this view.");
  return lines;
}
