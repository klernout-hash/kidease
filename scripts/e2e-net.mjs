/**
 * Transient network retries for CI smoke setup.
 * Role-fixture seed uses Playwright's APIRequestContext.post, which has
 * failed once with ECONNRESET. Retry that class of error up to 2 times.
 * Other failures (4xx, assertion, timeout) are not retried here.
 */

const TRANSIENT_NET =
  /ECONNRESET|ECONNREFUSED|EAI_AGAIN|ETIMEDOUT|EPIPE|ECONNABORTED|socket hang up|network socket disconnected|net::ERR_CONNECTION_|net::ERR_NETWORK_|net::ERR_ABORTED|apiRequestContext\.(?:post|get|fetch|put|patch|delete):[^\n]*(?:ECONNRESET|ECONNREFUSED|socket hang up|ETIMEDOUT)/i;

export function isTransientNetError(err) {
  const parts = [err?.message, err?.cause?.message, err?.cause?.code, err?.code, String(err || "")];
  return TRANSIENT_NET.test(parts.filter(Boolean).join("\n"));
}

/**
 * @param {() => Promise<unknown>} fn
 * @param {{ retries?: number, label?: string, sleep?: (ms: number) => Promise<void> }} [opts]
 */
export async function withNetRetry(fn, { retries = 2, label = "", sleep } = {}) {
  const wait = sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  let last;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (!isTransientNetError(err) || attempt === retries) throw err;
      const waitMs = 400 * (attempt + 1);
      if (label) {
        console.log(`[e2e] network retry ${attempt + 1}/${retries} ${label}`);
      }
      await wait(waitMs);
    }
  }
  throw last;
}
