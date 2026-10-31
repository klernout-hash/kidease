/**
 * Small text PDF. No extra library. WinAnsi covers the French accents used here.
 */

const WIN: Record<string, number> = {
  "é": 0xe9,
  "è": 0xe8,
  "ê": 0xea,
  "ë": 0xeb,
  "à": 0xe0,
  "â": 0xe2,
  "ä": 0xe4,
  "ù": 0xf9,
  "û": 0xfb,
  "ü": 0xfc,
  "ç": 0xe7,
  "ô": 0xf4,
  "ö": 0xf6,
  "î": 0xee,
  "ï": 0xef,
  "É": 0xc9,
  "È": 0xc8,
  "Ê": 0xca,
  "À": 0xc0,
  "Â": 0xc2,
  "Ç": 0xc7,
  "Ô": 0xd4,
  "Ù": 0xd9,
  "Î": 0xce,
  "’": 0x92,
  "–": 0x96,
  "—": 0x97,
};

function pdfEscape(text: string): string {
  let out = "";
  for (const char of text) {
    const code = WIN[char];
    if (code != null) {
      out += `\\${code.toString(8).padStart(3, "0")}`;
      continue;
    }
    if (char.charCodeAt(0) > 126) {
      out += "?";
      continue;
    }
    if (char === "\\") out += "\\\\";
    else if (char === "(") out += "\\(";
    else if (char === ")") out += "\\)";
    else out += char;
  }
  return out;
}

function pageStream(lines: readonly string[]): string {
  const commands = ["BT", "/F1 11 Tf", "48 760 Td", "14 TL"];
  for (const line of lines) commands.push(`(${pdfEscape(line)}) Tj`, "T*");
  commands.push("ET");
  return commands.join("\n");
}

/** One or more pages of plain lines. */
export function renderTextPdf(lines: readonly string[]): Uint8Array {
  const pageSize = 42;
  const chunks: string[][] = [];
  for (let i = 0; i < Math.max(lines.length, 1); i += pageSize) {
    chunks.push(lines.slice(i, i + pageSize));
  }
  if (chunks.length === 0) chunks.push(["KidEase"]);

  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  let nextId = 4;
  for (const chunk of chunks) {
    const contentId = nextId;
    nextId += 1;
    const pageId = nextId;
    nextId += 1;
    pageObjectIds.push(pageId);
    const stream = pageStream(chunk.length ? chunk : [""]);
    objects[contentId] = `${contentId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`;
    objects[pageId] =
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentId} 0 R /Resources << /Font << /F1 3 0 R >> >> >>\nendobj\n`;
  }
  const kids = pageObjectIds.map((id) => `${id} 0 R`).join(" ");
  objects[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objects[2] = `2 0 obj\n<< /Type /Pages /Count ${pageObjectIds.length} /Kids [${kids}] >>\nendobj\n`;
  objects[3] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n`;

  const header = "%PDF-1.4\n";
  const offsets: number[] = [0];
  let body = "";
  for (let id = 1; id < objects.length; id += 1) {
    const piece = objects[id];
    if (!piece) continue;
    offsets[id] = header.length + body.length;
    body += piece;
  }
  const size = objects.length;
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let id = 1; id < size; id += 1) {
    xref += `${String(offsets[id] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  const startxref = header.length + body.length;
  const trailer = `${xref}trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`;
  return new TextEncoder().encode(header + body + trailer);
}

export function dashboardPdfLines(input: {
  title: string;
  place: string;
  generatedAt: string;
  rows: Array<[string, string]>;
  notes: string[];
}): string[] {
  const lines = [input.title, input.place, input.generatedAt, ""];
  for (const [label, value] of input.rows) lines.push(`${label}: ${value}`);
  lines.push("", "Notes");
  for (const note of input.notes) {
    const words = note.split(/\s+/);
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > 90) {
        if (current) lines.push(current);
        current = word;
      } else current = next;
    }
    if (current) lines.push(current);
    lines.push("");
  }
  return lines;
}
