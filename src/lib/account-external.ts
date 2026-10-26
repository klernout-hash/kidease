/**
 * Best-effort removal of a closed account from Stripe, PostHog, GoHighLevel,
 * and Sentry. A missing key or a failed call never throws and never blocks
 * the database wipe. Status words only — no email, token, or customer id.
 */
import { POSTHOG_APP_HOST, POSTHOG_PROJECT_ID, personalApiKey } from "./admin-features.ts";
import { forgetGhlContact } from "./ghl-api.ts";
import { parseSentryDsn } from "./sentry-shared.ts";

export const SENTRY_AUTH_TOKEN_ENV = "SENTRY_AUTH_TOKEN";
export const SENTRY_ORG_ENV = "SENTRY_ORG";
export const SENTRY_PROJECT_ENV = "SENTRY_PROJECT";

export type ExternalForgetStatus = {
  stripe: string;
  posthog: string;
  ghl: string;
  sentry: string;
};

type FetchImpl = typeof fetch;

function orgFromDsnHost(host: string): string {
  const match = /^o(\d+)\.ingest(?:\.[a-z0-9-]+)?\.sentry\.io$/i.exec(host);
  return match?.[1] ?? "";
}

/** Org and project from env, or from the numeric ids in the DSN host and path. */
export function sentryProjectFromEnv(env: Record<string, string | undefined>): { org: string; project: string } | null {
  const orgEnv = String(env[SENTRY_ORG_ENV] || "").trim();
  const projectEnv = String(env[SENTRY_PROJECT_ENV] || "").trim();
  const dsn = String(env.SENTRY_DSN || env.VITE_PUBLIC_SENTRY_DSN || "").trim();
  const parsed = dsn ? parseSentryDsn(dsn) : null;
  const org = orgEnv || (parsed ? orgFromDsnHost(parsed.host) : "");
  const project = projectEnv || (parsed?.project ?? "");
  if (!org || !project) return null;
  return { org, project };
}

async function httpStatus(res: Response): Promise<"deleted" | "missing" | "failed"> {
  if (res.ok) return "deleted";
  if (res.status === 404 || res.status === 410) return "missing";
  return "failed";
}

async function forgetStripe(
  customerId: string | null | undefined,
  env: Record<string, string | undefined>,
  fetchImpl: FetchImpl,
): Promise<string> {
  const id = String(customerId || "").trim();
  if (!id) return "skipped";
  const key = String(env.STRIPE_SECRET_KEY || "").trim();
  if (!key) return "skipped";
  const res = await fetchImpl(`https://api.stripe.com/v1/customers/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${key}` },
  });
  return httpStatus(res);
}

async function forgetPostHog(userId: string, env: Record<string, string | undefined>, fetchImpl: FetchImpl): Promise<string> {
  const key = personalApiKey(env);
  if (!key || !userId) return "skipped";
  const headers = { Authorization: `Bearer ${key}` };
  const list = await fetchImpl(
    `${POSTHOG_APP_HOST}/api/projects/${POSTHOG_PROJECT_ID}/persons/?distinct_id=${encodeURIComponent(userId)}`,
    { headers },
  );
  if (list.status === 404) return "missing";
  if (!list.ok) return "failed";
  const json = (await list.json().catch(() => null)) as { results?: Array<{ id?: unknown }> } | null;
  const results = Array.isArray(json?.results) ? json.results : [];
  if (!results.length) return "missing";
  let failed = false;
  for (const row of results) {
    if (row?.id == null || row.id === "") continue;
    const del = await fetchImpl(
      `${POSTHOG_APP_HOST}/api/projects/${POSTHOG_PROJECT_ID}/persons/${encodeURIComponent(String(row.id))}/?delete_events=true`,
      { method: "DELETE", headers },
    );
    if ((await httpStatus(del)) === "failed") failed = true;
  }
  return failed ? "failed" : "deleted";
}

async function forgetSentry(userId: string, env: Record<string, string | undefined>, fetchImpl: FetchImpl): Promise<string> {
  const token = String(env[SENTRY_AUTH_TOKEN_ENV] || "").trim();
  if (!token) return "skipped";
  const project = sentryProjectFromEnv(env);
  if (!project || !userId) return "skipped";
  const res = await fetchImpl(
    `https://sentry.io/api/0/projects/${encodeURIComponent(project.org)}/${encodeURIComponent(project.project)}/users/${encodeURIComponent(userId)}/`,
    { method: "DELETE", headers: { Authorization: `Bearer ${token}` } },
  );
  return httpStatus(res);
}

export async function forgetExternalAccounts(input: {
  userId: string;
  email?: string | null;
  stripeCustomerId?: string | null;
  fetchImpl?: FetchImpl;
  env?: Record<string, string | undefined>;
}): Promise<ExternalForgetStatus> {
  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const status: ExternalForgetStatus = {
    stripe: "skipped",
    posthog: "skipped",
    ghl: "skipped",
    sentry: "skipped",
  };
  try {
    status.stripe = await forgetStripe(input.stripeCustomerId, env, fetchImpl);
  } catch {
    status.stripe = "failed";
  }
  try {
    status.posthog = await forgetPostHog(input.userId, env, fetchImpl);
  } catch {
    status.posthog = "failed";
  }
  try {
    const ghl = await forgetGhlContact({ email: input.email, fetchImpl, env });
    status.ghl = ghl.ok ? (ghl.skipped ? ghl.reason : ghl.action) : "failed";
  } catch {
    status.ghl = "failed";
  }
  try {
    status.sentry = await forgetSentry(input.userId, env, fetchImpl);
  } catch {
    status.sentry = "failed";
  }
  return status;
}
