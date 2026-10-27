/** A one-page PDF built from lines we already show. No extra library. */

const FOLDS: Record<string, string> = {
  "\u00e9": "e",
  "\u00e8": "e",
  "\u00ea": "e",
  "\u00eb": "e",
  "\u00e0": "a",
  "\u00e2": "a",
  "\u00f9": "u",
  "\u00fb": "u",
  "\u00f4": "o",
  "\u00ee": "i",
  "\u00ef": "i",
  "\u00e7": "c",
  "\u00c9": "E",
  "\u00c0": "A",
  "\u2019": "'",
  "\u2013": "-",
  "\u2014": "-",
  "\u00a0": " ",
  "\u2022": "*",
  "\u2026": "...",
};

function fold(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 32 || code > 126) {
      out += FOLDS[char] || "";
      continue;
    }
    out += char === "(" || char === ")" || char === "\\" ? `\\${char}` : char;
  }
  return out;
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
      return `BT /F1 12 Tf 56 ${y} Td (${fold(line).slice(0, 90)}) Tj ET`;
    })
    .join("\n");
  const stream = `${body}\n`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
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
