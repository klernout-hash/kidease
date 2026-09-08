export type ExploreSearchValues = {
  q?: string;
  name?: string;
  from?: string;
  to?: string;
};

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function parseExploreSearchFields(s: Record<string, unknown>): ExploreSearchValues {
  const out: ExploreSearchValues = {};
  if (typeof s.q === "string" && s.q.trim()) out.q = s.q.trim();
  if (typeof s.name === "string" && s.name.trim()) out.name = s.name.trim().slice(0, 80);
  if (typeof s.from === "string" && isIsoDate(s.from)) out.from = s.from.trim();
  if (typeof s.to === "string" && isIsoDate(s.to)) out.to = s.to.trim();
  if (out.from && out.to && out.to < out.from) {
    const swap = out.from;
    out.from = out.to;
    out.to = swap;
  }
  return out;
}

export function matchesDaycareName(
  item: { name: string; nameFr?: string | null },
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return item.name.toLowerCase().includes(q) || (item.nameFr ?? "").toLowerCase().includes(q);
}

export function formatExploreDateRange(from?: string, to?: string, locale = "en"): string {
  if (!from && !to) return "";
  const tag = locale === "fr" ? "fr-CA" : "en-CA";
  const fmt = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    if (!year || !month || !day) return iso;
    return new Date(year, month - 1, day).toLocaleDateString(tag, {
      month: "short",
      day: "numeric",
    });
  };
  if (from && to && from !== to) return `${fmt(from)} – ${fmt(to)}`;
  return fmt(from || to || "");
}

export function compactExploreSearch(values: {
  q?: string;
  name?: string;
  from?: string;
  to?: string;
}): ExploreSearchValues {
  const out: ExploreSearchValues = {};
  const q = values.q?.trim();
  const name = values.name?.trim();
  if (q) out.q = q;
  if (name) out.name = name.slice(0, 80);
  if (values.from && isIsoDate(values.from)) out.from = values.from;
  if (values.to && isIsoDate(values.to)) out.to = values.to;
  if (out.from && out.to && out.to < out.from) {
    const swap = out.from;
    out.from = out.to;
    out.to = swap;
  }
  return out;
}
