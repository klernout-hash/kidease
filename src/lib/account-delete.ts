/** Days a signed-in person can restore an account after they confirm deletion. */
export const ACCOUNT_RESTORE_DAYS = 30;

/** Exact phrase the delete form requires. Same in English and French. */
export const DELETE_CONFIRM_PHRASE = "DELETE";

export const ACCOUNT_RESTORE_MS = ACCOUNT_RESTORE_DAYS * 24 * 60 * 60 * 1000;

export function restoreDeadline(deletedAt: string | Date): Date {
  const start = deletedAt instanceof Date ? deletedAt.getTime() : new Date(deletedAt).getTime();
  return new Date(start + ACCOUNT_RESTORE_MS);
}

export function withinRestoreWindow(deletedAt: string | Date, now = Date.now()): boolean {
  const start = deletedAt instanceof Date ? deletedAt.getTime() : new Date(deletedAt).getTime();
  if (!Number.isFinite(start)) return false;
  return now - start < ACCOUNT_RESTORE_MS;
}
