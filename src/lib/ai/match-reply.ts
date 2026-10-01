/** Keep only slugs from the catalog we sent. A model pick outside that list is dropped. */
export function parseCentreMatch(
  text: string,
  allowed: readonly string[],
): { picks: Array<{ slug: string; why: string }>; note: string } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const json = JSON.parse(text.slice(start, end + 1)) as {
      picks?: Array<{ slug?: unknown; why?: unknown }>;
      note?: unknown;
    };
    const allow = new Set(allowed);
    const picks = (Array.isArray(json.picks) ? json.picks : [])
      .map((row) => ({
        slug: String(row?.slug ?? "").trim(),
        why: String(row?.why ?? "").trim().slice(0, 240),
      }))
      .filter((row) => row.slug.length > 0 && allow.has(row.slug))
      .slice(0, 3);
    return { picks, note: String(json.note ?? "").trim().slice(0, 400) };
  } catch {
    return null;
  }
}
