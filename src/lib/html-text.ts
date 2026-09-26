/**
 * Defensive HTML-entity decode for public listing text.
 * The catalogue can still store `&amp;` while a data fix lands separately.
 * React text nodes show those characters literally unless we decode first.
 */

const NAMED: Record<string, string> = {
  amp: "&",
  apos: "'",
  quot: '"',
  lt: "<",
  gt: ">",
  nbsp: "\u00a0",
};

function fromCodePoint(body: string): string | null {
  const hex = body[0] === "x" || body[0] === "X";
  const digits = hex ? body.slice(1) : body;
  const n = Number.parseInt(digits, hex ? 16 : 10);
  if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) return null;
  try {
    return String.fromCodePoint(n);
  } catch {
    return null;
  }
}

/** Decode named and numeric entities, including a double-encoded `&amp;amp;`. */
export function decodeHtml(value: string | null | undefined): string {
  let text = String(value ?? "");
  if (!text.includes("&")) return text;
  for (let pass = 0; pass < 3; pass += 1) {
    const next = text.replace(
      /&(#x[0-9a-f]+|#\d+|amp|apos|quot|lt|gt|nbsp);/gi,
      (entity, body: string) => {
        if (body[0] === "#") {
          const point = fromCodePoint(body.slice(1));
          return point ?? entity;
        }
        return NAMED[body.toLowerCase()] ?? entity;
      },
    );
    if (next === text) break;
    text = next;
  }
  return text;
}
