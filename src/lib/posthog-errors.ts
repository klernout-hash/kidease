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
