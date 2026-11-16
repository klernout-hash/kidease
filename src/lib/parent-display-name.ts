/** Account labels such as "QA parent (synthetic)" are not the guardian's name. */
export function isPlaceholderParentName(name: string | null | undefined): boolean {
  const text = String(name || "").trim().toLowerCase();
  if (!text) return true;
  if (text.includes("synthetic")) return true;
  if (text === "qa parent" || text === "parent" || text === "a parent") return true;
  return false;
}

/**
 * The name a daycare should see. A real first and last name on the request
 * wins over a placeholder account name.
 */
export function linkedParentName(input: {
  accountName?: string | null;
  givenName?: string | null;
}): string | null {
  const given = String(input.givenName || "").trim();
  const account = String(input.accountName || "").trim();
  if (given && (isPlaceholderParentName(account) || !account)) return given;
  if (account && !isPlaceholderParentName(account)) return account;
  return given || null;
}
