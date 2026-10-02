export type CentreTeamDedupeRow = {
  id: string;
  kind: string;
  daycareId: string;
  email: string;
  role: string;
};

function rank(row: CentreTeamDedupeRow): number {
  if (row.kind === "member" && row.role === "owner") return 0;
  if (row.kind === "member") return 1;
  return 2;
}

/** One row per centre and email. The owner wins over a second staff or invite row. */
export function dedupeCentreTeam<T extends CentreTeamDedupeRow>(rows: T[]): T[] {
  const kept = new Map<string, T>();
  const anon: T[] = [];
  for (const row of rows) {
    const email = row.email.trim().toLowerCase();
    if (!email) {
      anon.push(row);
      continue;
    }
    const key = `${row.daycareId}|${email}`;
    const prev = kept.get(key);
    if (!prev || rank(row) < rank(prev)) kept.set(key, row);
  }
  return [...kept.values(), ...anon];
}
