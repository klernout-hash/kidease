/**
 * Pay and the books are the centre owner's.
 * Staff can check themselves in and see their own hours. No rates. No pay.
 * A platform admin may see the combined government-money list, not edit pay.
 */

export type PayrollRole = "owner" | "manager" | "staff" | "lead" | "read_only" | "admin" | null;

export type AccessDenial = { ok: false; status: 403; reason: "owner_only" | "own_hours" | "sign_in" };

export function normalizePayrollRole(role: string | null | undefined, preset?: string | null): PayrollRole {
  const value = (preset || role || "").trim();
  if (value === "owner" || value === "manager" || value === "staff" || value === "lead" || value === "read_only" || value === "admin") {
    return value;
  }
  if ((role || "").trim() === "owner") return "owner";
  return null;
}

/** Pay profiles, pay day, stubs, books, government money, approvals, manual edits. */
export function decidePayBooks(input: { isOwner: boolean }): { ok: true } | AccessDenial {
  if (input.isOwner) return { ok: true };
  return { ok: false, status: 403, reason: "owner_only" };
}

export function canClock(role: PayrollRole): boolean {
  return role === "owner" || role === "manager" || role === "staff" || role === "lead";
}

/** A person may punch only their own shift, unless they are the owner recording a manual card. */
export function decideClock(input: {
  isOwner: boolean;
  role: PayrollRole;
  samePerson: boolean;
  manual: boolean;
}): { ok: true } | AccessDenial {
  if (input.manual) return input.isOwner ? { ok: true } : { ok: false, status: 403, reason: "owner_only" };
  if (!canClock(input.role) && !input.isOwner) return { ok: false, status: 403, reason: "sign_in" };
  if (input.isOwner || input.samePerson) return { ok: true };
  return { ok: false, status: 403, reason: "own_hours" };
}

export function decideOwnHours(input: { isOwner: boolean; samePerson: boolean }): { ok: true; showPay: boolean } | AccessDenial {
  if (input.isOwner) return { ok: true, showPay: true };
  if (input.samePerson) return { ok: true, showPay: false };
  return { ok: false, status: 403, reason: "own_hours" };
}

export function decideAdminRollup(input: { isPlatformAdmin: boolean }): { ok: true } | AccessDenial {
  if (input.isPlatformAdmin) return { ok: true };
  return { ok: false, status: 403, reason: "owner_only" };
}

/** Drop rates and government amounts before a staff response leaves the server. */
export function staffHoursView<T extends { rateCents?: number; netCents?: number; governmentCents?: number }>(
  row: T,
): Omit<T, "rateCents" | "netCents" | "governmentCents"> {
  const copy = { ...row };
  delete copy.rateCents;
  delete copy.netCents;
  delete copy.governmentCents;
  return copy;
}

export function rejectionMessage(reason: AccessDenial["reason"], locale: "en" | "fr"): string {
  if (locale === "fr") {
    if (reason === "own_hours") return "Vous pouvez voir seulement vos propres heures. Demandez au propriétaire pour la paie.";
    if (reason === "sign_in") return "Connectez-vous avec votre compte du centre pour pointer.";
    return "Seul le propriétaire du centre peut ouvrir la paie et les livres.";
  }
  if (reason === "own_hours") return "You can see only your own hours. Ask the owner about pay.";
  if (reason === "sign_in") return "Sign in with your centre account to check in.";
  return "Only the centre owner can open pay and the books.";
}
