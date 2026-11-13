/** Client analytics payloads do not need AI schemas or their source material. */
export function parentHelperEventProps(input: { path?: string } = {}) {
  const path = String(input.path || "").trim();
  if (!path.startsWith("/")) return {};
  return { path };
}

export function reviewSummaryEventProps(input: { daycareId?: string; count?: number } = {}) {
  const id = String(input.daycareId || "").trim();
  const props: Record<string, string | number> = {};
  if (id && !id.includes("@")) props.daycare_id = id;
  if (typeof input.count === "number" && input.count >= 0) props.review_count = input.count;
  return props;
}
