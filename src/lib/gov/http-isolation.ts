/** Indeterminate private authorization must not become permission to continue. */
export function privateHttpUnavailableResponse(): Response {
  return new Response("Authorization is temporarily unavailable.", {
    status: 503,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "private, no-store",
      "x-robots-tag": "noindex",
    },
  });
}
