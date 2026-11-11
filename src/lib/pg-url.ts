/**
 * node-pg treats sslmode=require as verify-full today, and warns on every
 * connection until the URL says verify-full itself. Rewriting those modes
 * keeps the current check and drops the warning. A URL with no sslmode
 * (local Postgres) is left alone.
 */
export function postgresPoolUrl(raw: string | undefined | null): string {
  const value = String(raw || "").trim();
  if (!value) return value;
  try {
    const url = new URL(value);
    const mode = (url.searchParams.get("sslmode") || "").toLowerCase();
    if (mode === "require" || mode === "prefer" || mode === "verify-ca") {
      url.searchParams.set("sslmode", "verify-full");
    }
    return url.toString();
  } catch {
    return value;
  }
}

const TRANSIENT = /ECONN|ETIMEDOUT|EAI_AGAIN|Connection terminated|timeout expired|Connection refused|too many clients|remaining connection slots/i;

/** Retry a dropped Neon connection. A real query error is not retried. */
export async function retryTransient<T>(run: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await run();
    } catch (err) {
      last = err;
      const message = err instanceof Error ? err.message : String(err);
      if (!TRANSIENT.test(message) || attempt === 2) throw err;
      await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
    }
  }
  throw last;
}
