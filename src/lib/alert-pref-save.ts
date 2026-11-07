/**
 * Parent alerts with no stored row stay on. A save writes only rows the
 * person actually moved, so opening the page cannot turn unknown into stored true.
 */

export function alertShownOn(prefs: Record<string, boolean | undefined>, typeId: string): boolean {
  return prefs[typeId] !== false;
}

export function alertPrefsToWrite(
  current: Record<string, boolean | undefined>,
  touched: readonly string[],
): Array<{ typeId: string; enabled: boolean }> {
  const seen = new Set<string>();
  const out: Array<{ typeId: string; enabled: boolean }> = [];
  for (const typeId of touched) {
    const id = typeId.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ typeId: id, enabled: current[id] === true });
  }
  return out;
}
