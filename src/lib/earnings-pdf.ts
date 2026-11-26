/** A one-page PDF built from lines we already show. No extra library. */

import { pdfEscape } from "./gov/pdf.ts";

// WinAnsi fonts and octal accents, so French prints "Payée", not "Payee".
function fold(value: string): string {
  return pdfEscape(value.replace(/\u2022/g, "*"));
}

export function downloadPdf(filename: string, lines: readonly string[]) {
  if (typeof document === "undefined") return;
  const bytes = statementPdf(lines);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  const blob = new Blob([buffer], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function statementPdf(lines: readonly string[]): Uint8Array {
  const body = lines
    .slice(0, 42)
    .map((line, index) => {
      const y = 740 - index * 16;
      return `BT /F1 12 Tf 56 ${y} Td (${fold(Array.from(line).slice(0, 90).join(""))}) Tj ET`;
    })
    .join("\n");
  const stream = `${body}\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ];
  let pdf = "%PDF-1.1\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i < offsets.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}
