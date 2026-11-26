import { parseQaAllowlist } from "./qa-send.ts";

/**
 * Mail about a test listing is normally dropped. A QA tester still needs the
 * normal tour/thread mail at their own QA address, so let it through when the
 * recipient is named on QA_SEND_ALLOWLIST. A "*" wildcard never counts here.
 */
export function testListingMailAllowed(to: string | null | undefined, allowlistRaw: string | null | undefined): boolean {
  const email = String(to || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return false;
  return parseQaAllowlist(allowlistRaw).some((entry) => entry !== "*" && entry === email);
}
