# Production uptime (Better Stack)

KidEase pages Kyle when **www.kidease.ca** is down. Error ingest stays on Sentry; this is HTTP uptime + on-call.

## Why Better Stack (not Checkly)

| | Better Stack Uptime | Checkly |
| --- | --- | --- |
| Fit | HTTP / keyword / heartbeat monitors + email / SMS / Slack / phone | Playwright + API checks as code |
| KidEase today | Sentry already covers exceptions. CI already runs Playwright. The gap is “is www reachable?” | Would add a checkly.config, CLI, and a deploy-time API key |
| Vercel | Independent probes from Better Stack’s edge. No extra npm dep. App boots with keys unset | Useful later for a booked-tour journey, not for first-page paging |

**Pick: Better Stack.** Dashboard monitors hit `https://www.kidease.ca/` and `/api/health`. No token is required for the app to start.

Checkly stays a later option if we want as-code browser checks beyond the existing e2e suite.

## What is wired in the repo

- Public `GET` / `HEAD` [`/api/health`](https://www.kidease.ca/api/health) — `{ ok, status, service: "kidease", checks: { app, database } }`.
  - `app` is `ok` when the serverless handler runs.
  - `database` is `ok` after `select 1` (Neon / local PGLite), `skipped` when `DATABASE_URL` is unset on Vercel (catalogue still renders), `error` → HTTP 503.
  - No auth. `Cache-Control: no-store`. `X-Robots-Tag: noindex`.
  - Does not leak connection strings or Better Stack secrets.
- Optional `BETTERSTACK_HEARTBEAT_URL` — only `https://uptime.betterstack.com/…` or `https://betteruptime.com/…`. Unset = no-op. The HTTP monitors do **not** need this.

## Console steps (Kyle)

Do this in [Better Stack → Uptime](https://betterstack.com/). Do **not** paste real tokens into git.

1. Create a Better Stack account with **kyle@kidease.ca**.
2. **Monitors → Create monitor**
   - URL: `https://www.kidease.ca/`
   - Type: HTTP(S). Expect **200**. Period: 30s if the plan allows, otherwise 1–3 min.
   - Optional keyword: `KidEase` (homepage identity). Skip if you only want status codes.
3. Second monitor
   - URL: `https://www.kidease.ca/api/health`
   - Expect **200**. Optional keyword: `"ok":true`
4. **On-call / Escalation → Email** **kyle@kidease.ca**. Confirm the subscription mail.
5. (Optional) Heartbeat monitor for a cron. Copy the Heartbeat URL into Vercel Production as `BETTERSTACK_HEARTBEAT_URL` (encrypted). Set the heartbeat period to match the job. Leave unset until you need it.
6. Pause / unpause a monitor once to prove the email arrives. Do not use a fake outage on production parents if you can avoid it.

`BETTERSTACK_UPTIME_API_TOKEN` is listed in `.env.example` as a **dashboard-only** name. The app does not read it. Terraform / API sync is later — do not invent a token.

## Vercel env checklist

Set on **Production** only if you use a heartbeat. Preview does not need these. Never prefix `VITE_`. Never commit values.

| Name | Required to boot | Notes |
| --- | --- | --- |
| `BETTERSTACK_HEARTBEAT_URL` | no | Optional. HTTPS URL from a Better Stack Heartbeat monitor. |
| `BETTERSTACK_UPTIME_API_TOKEN` | no | Not used by the app. Paste in Better Stack if you use their API later. |

HTTP monitors need **no** Vercel secret. The site stays up without them.

## Later (not this PR)

- SMS / phone on-call on the same Better Stack escalation (Better Stack → Integrations).
- Slack `#incidents` webhook.
- Public status page (`status.kidease.ca`) if Kyle wants parent-facing incidents.
- Checkly Playwright check for `/login` or book-a-tour — only if Better Stack HTTP is not enough.
- Heartbeat from `/api/search-alerts` or Inngest if we want “cron still firing” separate from homepage up.
