/**
 * Lightweight error hook. If SENTRY_DSN is set, post to Sentry's store API
 * (no bundler plugin). Otherwise log so Vercel error alerts can pick it up.
 *
 * Enable Vercel: Project → Logs → create an error alert on production/preview.
 */

type ObserveContext = {
  route?: string;
  extra?: Record<string, string | number | boolean | null | undefined>;
};

function sentryIngest(dsn: string) {
  try {
    const url = new URL(dsn);
    const key = url.username;
    const project = url.pathname.replace(/^\//, "");
    if (!key || !project) return null;
    return {
      store: `${url.protocol}//${url.host}/api/${project}/store/`,
      key,
    };
  } catch {
    return null;
  }
}

function asError(err: unknown) {
  if (err instanceof Error) return err;
  return new Error(typeof err === "string" ? err : "Unknown error");
}

export function reportError(err: unknown, context: ObserveContext = {}) {
  const error = asError(err);
  const route = context.route || "app";
  console.error(`[kidease-alert] ${route}`, error.message, context.extra ?? "", error.stack ?? "");

  const dsn = (typeof process !== "undefined" ? process.env.SENTRY_DSN : undefined)?.trim();
  if (!dsn) return;

  const ingest = sentryIngest(dsn);
  if (!ingest) return;

  const payload = {
    message: error.message,
    exception: {
      values: [{ type: error.name, value: error.message, stacktrace: { frames: [] } }],
    },
    tags: { route },
    extra: context.extra ?? {},
    timestamp: Date.now() / 1000,
    platform: "javascript",
    level: "error",
  };

  void fetch(ingest.store, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${ingest.key}, sentry_client=kidease/1`,
    },
    body: JSON.stringify(payload),
  }).catch((sendErr) => {
    console.error("[kidease-alert] sentry send failed", sendErr);
  });
}

export function parseSentryDsn(dsn: string) {
  return sentryIngest(dsn);
}
