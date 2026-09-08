# Feature flags (env + optional PostHog)

KidEase product gates (`FEATURE_SMS`, `FEATURE_PUSH`, `FEATURE_VIDEO`, `FEATURE_INAPP_CHAT`, `FEATURE_PROVIDER_SUBSCRIPTIONS`) go through `src/lib/flags.ts`.

**Env is the safe fallback.** If remote is unset, down, or the flag does not exist in PostHog, behavior is exactly today’s `FEATURE_*=` env read.

`FEATURE_PUSH` and `FEATURE_SMS` stay **off** unless you turn them on. This layer does not flip them.

## Why PostHog

PostHog is already wired (`posthog-js`, `VITE_PUBLIC_POSTHOG_KEY` / `POSTHOG_HOST` on Vercel **kidease-git**, legal copy, `isPostHogFlagEnabled` on the client). A thin `POST /flags?v=2` call on the server needs **no extra SDK** and **no personal API key**.

Vercel Flags, Flagsmith, and LaunchDarkly would add another vendor and another secret. Skip them unless we drop PostHog.

Do **not** use these flags for auth, Stripe, or Turnstile. Those stay their own env-gated helpers.

## How Kyle flips a flag (no redeploy)

1. Confirm credentials for that channel exist (Twilio / FCM / APNs). Flags do not invent keys. SMS also needs CASL consent + STOP — see `docs/sms.md`.
2. On Vercel **kidease-git** (Production + Preview), set `POSTHOG_FLAGS_KEY` to the **same public project key** already used as `VITE_PUBLIC_POSTHOG_KEY` (`phc_…`). Optional: `POSTHOG_FLAGS_HOST` if ingest is not `https://us.i.posthog.com`. Redeploy **once** so the server can call PostHog. Leave the key unset to stay env-only.
3. In [PostHog](https://us.posthog.com) → KidEase → **Feature flags** → **New feature flag**.
   - Key must match the env name exactly: `FEATURE_SMS`, `FEATURE_PUSH`, `FEATURE_VIDEO`, `FEATURE_INAPP_CHAT`, or `FEATURE_PROVIDER_SUBSCRIPTIONS`.
   - Create the flag **disabled**. Boolean release toggle (not a % experiment). The server evaluates as distinct id `kidease-server`.
4. Enable or disable the flag in PostHog. Within ~30s the app picks it up (in-memory TTL). No Vercel redeploy.
5. Confirm Admin → Chat lab (`/admin-chat`): source reads **PostHog**, value on/off. Secret values are never shown.

To go back to env-only: disable or delete the PostHog flag (missing key → env), or unset `POSTHOG_FLAGS_KEY` and redeploy.

Env still works as a fallback when PostHog is down (last successful overlay is kept; if none, env). You can also set `FEATURE_*=1` or `0` on Vercel the old way — that needs a redeploy.

## Vercel env

| Name | Required | Notes |
| --- | --- | --- |
| `FEATURE_SMS` | no | Default **off**. Leave `0` until Twilio + CASL are ready. |
| `FEATURE_PUSH` | no | Default **off**. Leave `0` until FCM / APNs + a native binary exist. |
| `FEATURE_VIDEO` | no | Default **off**. |
| `FEATURE_INAPP_CHAT` | no | Default **off**. |
| `FEATURE_PROVIDER_SUBSCRIPTIONS` | no | Default **on** when unset. |
| `POSTHOG_FLAGS_KEY` | no | Server-only. Same `phc_…` project key as analytics. Leave blank to disable remote. Never commit a real value. |
| `POSTHOG_FLAGS_HOST` | no | Defaults to `POSTHOG_HOST` or `https://us.i.posthog.com`. |

The app **boots with no remote keys**. Do not invent a personal API key or a second PostHog project.

## What is wired

- `evaluateFeatureFlag` / `smsEnabled` / `pushEnabled` / `videoEnabled` / `inAppChatEnabled` / `providerSubscriptionsEnabled`.
- Send / register / mint paths in `src/lib/server/sms.ts`, `push-send.ts`, `push-tokens.ts`, `video.ts`.
- Admin → Chat lab shows on/off **and** source (env / PostHog / default).
- Client `isPostHogFlagEnabled` is analytics-only. Server flags are the source of truth for SMS / push / video send gates.
- Web session replay uses a separate client flag, `session-replay-web` (kill switch). See `docs/posthog.md`.

## Later (not this PR)

- Per-user or % rollouts (today the server uses one distinct id).
- A dedicated `/admin-flags` page. Chat lab is enough to read state.
