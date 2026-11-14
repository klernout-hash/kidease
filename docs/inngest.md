# Inngest (background jobs)

KidEase uses [Inngest](https://www.inngest.com) for durable background work. The approved serving registry contains existing saved-search alerts and hourly tour holds when both existing Inngest keys are configured. With either key absent it serves search only. The other 15 job definitions and tracker remain unserved. Deployment, sync and natural tour execution still require the coordinator rollout checks. See [tour scheduler readiness](operations/tour-scheduler-readiness.md) before any deployment or sync.

TanStack Start on Vercel — **not** a Next.js `app/api` route. The handler is `src/routes/api/inngest.ts` (`createFileRoute` + `inngest/edge`).

`FEATURE_PUSH` and `FEATURE_SMS` stay off. Inngest does not flip those flags. Remote toggles (when configured) live in PostHog — see `docs/flags.md`.

## Vercel env (kidease-git)

Set the **same names** on Production **and** Preview. Encrypted. Never prefix `VITE_`. Never commit values.

| Name | Required | Where to copy it |
| --- | --- | --- |
| `INNGEST_EVENT_KEY` | yes (to send events / register Cloud) | Inngest Cloud → **Manage** → Event Keys. Paste the key. Do not invent one. |
| `INNGEST_SIGNING_KEY` | yes (Cloud → app HMAC) | Inngest Cloud → **Manage** → Signing Key. Paste the key. Do not invent one. |
| `INNGEST_SERVE_ORIGIN` | optional | `https://www.kidease.ca` so Cloud syncs the custom domain instead of `*.vercel.app`. |

The [Inngest Vercel integration](https://www.inngest.com/docs/deploy/vercel) can set Event + Signing keys automatically when you link project **kidease-git**. Still copy those names into 1Password Environments so they are not only on Vercel — see `docs/1password-environments.md`.

Absent keys = the Next/Vite app still boots. `/api/inngest` exists but Cloud cannot sync. Existing Vercel crons keep running the HTTP jobs.

## Register the app in Inngest Cloud

1. Use the existing Production app at [app.inngest.com](https://app.inngest.com), SDK id `kidease`; do not create a second app or change keys.
2. Verify the reviewed activation head, exact-head checks, production deployment identity and presence of both existing keys without exposing values.
3. The coordinator verifies that `https://www.kidease.ca/api/inngest` targets that current deployment, then syncs through the existing authorized app. Deployment itself can activate registration if the hosting integration auto-syncs.
4. The approved endpoint must list exactly **Search alerts (hourly)** (`search-alerts-hourly`) and **Tour holds (hourly)** (`tour-holds-hourly`). Stop on any other function or identity mismatch. Do not resync an older deployment exposing all 17 definitions or treat a Preview URL with the same app ID as isolation.
5. Local: `npx inngest-cli@latest dev` and `npm run dev`. Dev Server discovers `http://localhost:8080/api/inngest`. Local keys are not required.

This production rollout does not change Preview protection, access controls or secrets. Do not broaden access to make a sync succeed.

## First job: search alerts

`src/inngest/functions.ts` wraps `runSearchAlertJob()` — the same function as `GET|POST /api/search-alerts`.

| When | What runs |
| --- | --- |
| `INNGEST_*` unset | Vercel cron `20 * * * *` → `/api/search-alerts` runs the job (today’s path). |
| Both keys set (Cloud registered) | Inngest cron `TZ=America/Winnipeg 20 * * * *` runs the job. `/api/search-alerts` no-ops so it does not double-fire. |
| `?dryRun=1` or `?force=1` | HTTP route still runs locally (ops). |

The existing `kidease/search-alerts.run` event trigger is unchanged; the tour rollout does not send manual events.

## Waitlist pulse

`waitlist-pulse` is defined but not registered by this bounded serving endpoint. Its implementation fans out one “spot open” event with `data.pulseId`; that definition is not authorization to activate it.

When Inngest keys are unset, `enqueueWaitlistPulse` runs `runWaitlistPulseJob()` inline. SMS still requires `FEATURE_SMS` + CASL. `FEATURE_PUSH` stays off. See `docs/waitlist-pulse.md`.

## Tour soft-holds

`tour-holds-hourly` is admitted by this approved activation source only with both existing keys. After deployment and verified registration, its natural hourly :50 sweep expires overdue pending holds (`hold_expires_at`) and frees the seat, then runs gated due reminders. It uses the same worker as `GET|POST /api/tour-holds`; the existing HTTP fallback decision is unchanged. Source registration is not proof of live execution.

| When | What runs |
| --- | --- |
| `INNGEST_*` unset | Vercel cron `50 * * * *` → `/api/tour-holds`. |
| Both keys set | `/api/tour-holds` still defers unless `?dryRun=1` or `?force=1`. This does not prove tour registration or execution. Require the verified two-function registry and natural-run phase evidence from the rollout procedure. |

The existing `kidease/tour-holds.expire` event trigger is retained, but no manual event, forced route or dry-run is used for rollout proof. Book/list paths still expire due holds so a slot can free before the hourly tick; #847 remains blocked on verified natural scheduled execution. Kyle has accepted up-to-one-hour expiry-notice timing.

## Later (not this PR)

- Daily digest (`/api/digest`) as an Inngest cron.
- DocuSign poll / follow-ups.
- SMS digests (`FEATURE_SMS` stays `0` until Kyle flips it).
