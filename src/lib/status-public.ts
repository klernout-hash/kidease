/**
 * Honest public status rows. SMS and chat stay "coming soon".
 * Card payments follow the website because Stripe Checkout is live with it.
 */

export type StatusServiceId = "web" | "database" | "search" | "messages" | "payments";

export type StatusServiceState = "ok" | "down" | "skipped" | "partial" | "unknown";

export type StatusService = {
  id: StatusServiceId;
  state: StatusServiceState;
};

export type PublicStatusInput = {
  ok?: boolean;
  checks?: { app?: string; database?: string };
} | null;

export function statusServices(health: PublicStatusInput): StatusService[] {
  if (!health?.checks) {
    return [
      { id: "web", state: "unknown" },
      { id: "database", state: "unknown" },
      { id: "search", state: "unknown" },
      { id: "messages", state: "unknown" },
      { id: "payments", state: "unknown" },
    ];
  }
  const app: StatusServiceState = health.checks.app === "ok" ? "ok" : "down";
  const database: StatusServiceState =
    health.checks.database === "ok" ? "ok" : health.checks.database === "skipped" ? "skipped" : "down";
  const search: StatusServiceState = app === "ok" && database !== "down" ? "ok" : "down";
  return [
    { id: "web", state: app },
    { id: "database", state: database },
    { id: "search", state: search },
    { id: "messages", state: app === "ok" ? "partial" : "down" },
    { id: "payments", state: app === "ok" ? "ok" : "down" },
  ];
}

/** America/Winnipeg is Central Time, including daylight time. */
export function formatStatusCheckedAt(iso: string, locale: "en" | "fr"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(locale === "fr" ? "fr-CA" : "en-CA", {
    timeZone: "America/Winnipeg",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}
