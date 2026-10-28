/**
 * Tag KidEase QA and operator sessions so product analytics can
 * separate them from parent visits. Never sends the email itself.
 */

const INTERNAL_EMAILS = new Set([
  "kyle@kidease.ca",
  "kyle@openroadoutlet.ca",
  "klernout@hotmail.com",
]);

export type InternalQaInput = {
  email?: string | null;
  search?: string | null;
  cookie?: string | null;
  webdriver?: boolean | null;
};

function hasFlag(raw: string, name: string): boolean {
  return new RegExp(`(?:^|[?&;\\s])${name}=1(?:&|;|$)`).test(raw);
}

export function isInternalQaTraffic(input: InternalQaInput = {}): boolean {
  if (input.webdriver) return true;
  const email = String(input.email || "").trim().toLowerCase();
  if (email) {
    if (INTERNAL_EMAILS.has(email)) return true;
    if (email.endsWith("@kidease.ca")) return true;
    if (email.includes("qa-test")) return true;
  }
  const search = String(input.search || "");
  const cookie = String(input.cookie || "");
  if (hasFlag(search, "ke_internal") || hasFlag(cookie, "ke_internal")) return true;
  if (/(?:^|[?&])qa-test(?:=|&|$)/.test(search)) return true;
  if (/(?:^|;\s*)qa-test=/.test(cookie)) return true;
  return false;
}
