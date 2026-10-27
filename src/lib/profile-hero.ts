/** Profile hero helpers. Missing dates and short accounts stay null so the screen hides that stat. */

export type ProfileRoleId = "parent" | "daycare" | "admin" | "support";

export function profileRoleId(role: string | null | undefined, desk: string | null | undefined): ProfileRoleId | null {
  if (desk === "parent") return "parent";
  if (desk === "provider") return "daycare";
  if (desk === "admin") return "admin";
  if (desk === "support") return "support";
  if (role === "admin") return "admin";
  if (role === "provider") return "daycare";
  if (role === "support") return "support";
  if (role === "parent") return "parent";
  return null;
}

export function showProfileStats(roleId: ProfileRoleId | null): boolean {
  return roleId === "daycare";
}

/** First required profile field that is still empty, in screen order. */
export function firstIncompleteField(fields: ReadonlyArray<{ id: string; filled: boolean }>): string | null {
  for (const field of fields) {
    if (!field.filled) return field.id;
  }
  return null;
}

function timeOf(value: string | Date | null | undefined): number | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  const time = date.getTime();
  return Number.isNaN(time) ? null : time;
}

/** Earlier real timestamp. Null when neither value is a date. */
export function earlierJoinedAt(
  profileCreated: string | Date | null | undefined,
  userCreated: string | Date | null | undefined,
): string | null {
  const times = [timeOf(profileCreated), timeOf(userCreated)].filter((time): time is number => time != null);
  if (!times.length) return null;
  return new Date(Math.min(...times)).toISOString();
}

/**
 * Completed years since the account was created.
 * Under one year, or no date, stays null so the stat is hidden.
 */
export function yearsOnKidEase(joinedAt: string | null | undefined, now = new Date()): number | null {
  const start = timeOf(joinedAt);
  if (start == null || start > now.getTime()) return null;
  const from = new Date(start);
  let years = now.getFullYear() - from.getFullYear();
  const month = now.getMonth() - from.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < from.getDate())) years -= 1;
  if (!Number.isFinite(years) || years < 1) return null;
  return years;
}
