# Security

Please report vulnerabilities privately to [kyle@kidease.ca](mailto:kyle@kidease.ca). Do not open a public GitHub issue for security reports.

## Error monitoring (Sentry)

Production uses the official `@sentry/node` (SSR / API) and `@sentry/react` (browser) SDKs.

- `SENTRY_DSN` — server-only. Already set on Vercel Production. Never prefix `VITE_`.
- `VITE_PUBLIC_SENTRY_DSN` — the same DSN string, public, required for client errors. Set this on Vercel Production (and Preview if you want browser events there).

If neither is set, the app boots and skips ingest. Events drop cookies, `Authorization` headers, emails, tokens, and child-name fields. Common browser-extension errors are ignored.

Admin-only check: signed-in staff on `www.kidease.ca` can `GET /api/admin/sentry-test` (session + `profiles.role = admin` + same-site, same gate as other `/api/admin/*`) to send `KidEase Sentry test`.
