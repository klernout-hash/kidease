# Inngest (background jobs)

KidEase uses [Inngest](https://www.inngest.com) for durable background work. Jobs today: saved-search alerts (hourly) and **waitlist pulse** (`kidease/waitlist.pulse`). Later: SMS digests, DocuSign follow-ups.

TanStack Start on Vercel — **not** a Next.js `app/api` route. The handler is `src/routes/api/inngest.ts` (`createFileRoute` + `inngest/edge`).

`FEATURE_PUSH` and `FEATURE_SMS` stay off. Inngest does not flip those flags. Remote toggles (when configured) live in PostHog — see `docs/flags.md`.

## Vercel env (kidease-git)

Set the **same names** on Production **and** Preview. Encrypted. Never prefix `VITE_`. Never commit values.

| Name | Required | Where to copy it |
| --- | --- | --- |
| `INNGEST_EVENT_KEY` | yes (to send events / register Cloud) | Inngest Cloud → **Manage** → Event Keys. Paste the key. Do not invent one. |
| `INNGEST_SIGNING_KEY` | yes (Cloud → app HMAC) | Inngest Cloud → **Manage** → Signing Key. Paste the key. Do not invent one. |
| `INNGEST_SERVE_ORIGIN` | optional | `https://www.kidease.ca` so Cloud syncs the custom domain instead of `*.vercel.app`. |

The [Inngest Vercel integration](https://www.inngest.com/docs/deploy/vercel) can set Event + Signing keys automatically when you link project **kidease-git**.

Absent keys = the Next/Vite app still boots. `/api/inngest` exists but Cloud cannot sync. Existing Vercel crons keep running the HTTP jobs.

## Register the app in Inngest Cloud

1. Sign in at [app.inngest.com](https://app.inngest.com). Create an app (SDK id is `kidease`).
2. Paste Event Key and Signing Key into Vercel **kidease-git** (Production + Preview). Redeploy.
3. Sync:
   - Production: `https://www.kidease.ca/api/inngest`
   - Preview: `https://<preview>.vercel.app/api/inngest`
4. After a successful sync you should see **Search alerts (hourly)** (`search-alerts-hourly`) and **Waitlist pulse** (`waitlist-pulse`).
5. Local: `npx inngest-cli@latest dev` and `npm run dev`. Dev Server discovers `http://localhost:8080/api/inngest`. Local keys are not required.

If Preview has Vercel Deployment Protection, enable **Protection Bypass for Automation** and add that secret in the Inngest Vercel integration so Cloud can reach `/api/inngest`.

## First job: search alerts

`src/inngest/functions.ts` wraps `runSearchAlertJob()` — the same function as `GET|POST /api/search-alerts`.

| When | What runs |
| --- | --- |
| `INNGEST_*` unset | Vercel cron `20 * * * *` → `/api/search-alerts` runs the job (today’s path). |
| Both keys set (Cloud registered) | Inngest cron `TZ=America/Winnipeg 20 * * * *` runs the job. `/api/search-alerts` no-ops so it does not double-fire. |
| `?dryRun=1` or `?force=1` | HTTP route still runs locally (ops). |

Event `kidease/search-alerts.run` can invoke the same function from the Inngest dashboard.

## Waitlist pulse

`waitlist-pulse` fans out one “spot open” event. Event `kidease/waitlist.pulse` with `data.pulseId`. Idempotent on that id.

When Inngest keys are unset, `enqueueWaitlistPulse` runs `runWaitlistPulseJob()` inline. SMS still requires `FEATURE_SMS` + CASL. `FEATURE_PUSH` stays off. See `docs/waitlist-pulse.md`.

## Later (not this PR)

- Daily digest (`/api/digest`) as an Inngest cron.
- DocuSign poll / follow-ups.
- SMS digests (`FEATURE_SMS` stays `0` until Kyle flips it).
