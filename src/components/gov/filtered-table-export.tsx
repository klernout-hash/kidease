import { useEffect, useState } from "react";
import { filteredTableCsv, filteredTablePdfLines, type ExportCell } from "@/lib/gov/filtered-export";
import { renderTextPdf } from "@/lib/gov/pdf";
import { govFilteredExportFlag } from "@/lib/server/gov-filtered-export";

function download(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** Download the rows currently on screen, after the filters on this page. */
export function FilteredTableExport({
  title,
  headers,
  rows,
  locale,
}: {
  title: string;
  headers: readonly string[];
  rows: readonly (readonly ExportCell[])[];
  locale: "en" | "fr";
}) {
  const [on, setOn] = useState(true);
  useEffect(() => {
    void govFilteredExportFlag()
      .then((enabled) => setOn(Boolean(enabled)))
      .catch(() => setOn(true));
  }, []);
  if (!on) return null;
  const fr = locale === "fr";
  return (
    <div className="mt-2 flex flex-wrap gap-3" data-ke="gov-filtered-export">
      <button
        type="button"
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary touch-manipulation"
        onClick={() => download("kidease-filtered.csv", new Blob([filteredTableCsv(headers, rows)], { type: "text/csv;charset=utf-8" }))}
      >
        {fr ? "Télécharger ce tableau (CSV)" : "Download this table (CSV)"}
      </button>
      <button
        type="button"
        className="inline-flex min-h-11 items-center text-sm font-medium text-primary touch-manipulation"
        onClick={() => {
          const bytes = renderTextPdf(filteredTablePdfLines(title, headers, rows));
          const copy = new Uint8Array(bytes.byteLength);
          copy.set(bytes);
          download("kidease-filtered.pdf", new Blob([copy], { type: "application/pdf" }));
        }}
      >
        {fr ? "Télécharger ce tableau (PDF)" : "Download this table (PDF)"}
      </button>
    </div>
  );
}
