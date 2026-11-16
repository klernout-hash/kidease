/** A QA row can point at qa-synthetic/ without a stored file. The bytes are a labeled test page, not a health record. */

export function isQaSyntheticRef(ref: string | null | undefined): boolean {
  return String(ref || "").trim().startsWith("qa-synthetic/");
}

export function qaSyntheticFamilyPdf(): Buffer {
  const lines = [
    "%PDF-1.4",
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 420 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    "4 0 obj << /Length 92 >> stream",
    "BT /F1 14 Tf 36 120 Td (KidEase test file.) Tj 0 -24 Td (This is not a real family record.) Tj ET",
    "endstream endobj",
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
    "trailer << /Root 1 0 R >>",
    "%%EOF",
  ];
  return Buffer.from(`${lines.join("\n")}\n`);
}
