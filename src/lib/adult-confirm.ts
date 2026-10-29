/** Set before a social redirect. The boot call stores 18+ and terms acceptance. */
export const ADULT_CONFIRM_KEY = "ke-adult-confirmed";

export function markAdultConfirmedForSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(ADULT_CONFIRM_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function takeAdultConfirmedFlag(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  try {
    if (sessionStorage.getItem(ADULT_CONFIRM_KEY) !== "1") return false;
    sessionStorage.removeItem(ADULT_CONFIRM_KEY);
    return true;
  } catch {
    return false;
  }
}
