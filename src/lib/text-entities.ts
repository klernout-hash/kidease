/** Turn stored HTML entities back into characters. Names sometimes arrive double-encoded. */
export function decodeBasicEntities(value: string): string {
  let out = String(value ?? "");
  for (let i = 0; i < 3; i += 1) {
    const next = out
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'");
    if (next === out) break;
    out = next;
  }
  return out;
}
