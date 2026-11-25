/**
 * PostHog exception capture gates. Pure: no SDK, no secrets.
 * scripts/automations.test.mjs loads this file in Node.
 *
 * Bots and WebDriver never count as parent errors. A `?ke_analytics=1`
 * override that lets e2e record pageviews does not turn exception capture on.
 */

export type ExceptionCaptureMode = "off" | "dry_run" | "live";

const BOT_UA =
  /bot|crawl|spider|slurp|preview|headless|phantom|puppeteer|playwright|selenium|webdriver|bytespider|petalbot|ahrefs|semrush|dotbot|yandex|baiduspider|duckduckbot|applebot|facebookexternalhit|embedly|quora link|whatsapp|telegrambot/i;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const ua = String(userAgent || "").trim();
  if (!ua) return false;
  return BOT_UA.test(ua);
}

/** Live capture only. Dry-run and off do not send. WebDriver and bots never send. */
export function shouldCaptureException(input: {
  mode: ExceptionCaptureMode;
  webdriver?: boolean | null;
  userAgent?: string | null;
}): boolean {
  if (input.mode !== "live") return false;
  if (input.webdriver) return false;
  if (isBotUserAgent(input.userAgent)) return false;
  return true;
}

/** Drop secrets and addresses before a message is logged or sent to PostHog. */
export function sanitizeExceptionMessage(raw: unknown): string {
  let text = raw instanceof Error ? raw.message : String(raw ?? "");
  text = text.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, "[database]");
  text = text.replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, "[email]");
  text = text.replace(/\b(?:bearer|token|secret|password|api[_-]?key)\b\s*[:=]\s*\S+/gi, "[secret]");
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return "Error";
  return text.slice(0, 180);
}

export function exceptionTypeName(raw: unknown): string {
  if (raw instanceof Error && raw.name) return raw.name.slice(0, 80);
  return "Error";
}

function blankText(value: unknown): boolean {
  return String(value ?? "").trim() === "";
}

/**
 * True for a `$exception` with no type and no message anywhere (C7: four
 * empty exceptions in PostHog). Those carry nothing to fix and hide real ones.
 */
export function isEmptyExceptionEvent(event: { event?: string; properties?: Record<string, unknown> } | null): boolean {
  if (!event || event.event !== "$exception") return false;
  const props = event.properties || {};
  const list = Array.isArray(props.$exception_list) ? (props.$exception_list as Array<Record<string, unknown>>) : [];
  const listEmpty = list.every((row) => !row || (blankText(row.type) && blankText(row.value)));
  return (
    listEmpty &&
    blankText(props.$exception_type) &&
    blankText(props.$exception_message) &&
    (blankText(props.$exception_types) || (Array.isArray(props.$exception_types) && props.$exception_types.every(blankText))) &&
    (blankText(props.$exception_values) || (Array.isArray(props.$exception_values) && props.$exception_values.every(blankText)))
  );
}

/** PostHog `before_send`: drop an empty `$exception`, pass everything else. */
export function dropEmptyExceptionEvent<T extends { event?: string; properties?: Record<string, unknown> }>(
  event: T | null,
): T | null {
  return isEmptyExceptionEvent(event) ? null : event;
}
