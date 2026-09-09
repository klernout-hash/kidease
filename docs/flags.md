# Feature flags (env + optional PostHog)

KidEase product gates (`FEATURE_SMS`, `FEATURE_PUSH`, `FEATURE_VIDEO`, `FEATURE_INAPP_CHAT`, `FEATURE_PROVIDER_SUBSCRIPTIONS`, `SHOW_PAY_CTAS`) go through `src/lib/flags.ts`.

**Env is the safe fallback.** If remote is unset, down, or the flag does not exist in PostHog, behavior is exactly today’s `FEATURE_*=` env read.

`FEATURE_PUSH`, `FEATURE_SMS`, and `FEATURE_VIDEO` stay **off** unless you turn them on. This layer does not flip them.

## Production vs Preview

`src/lib/channel-readiness.ts` is the safe-enablement gate. `smsEnabled` / `pushEnabled` / `videoEnabled` still report the raw flag. Surfaces and register paths use **armed**:

| Runtime | `VERCEL_ENV` | Flag `1` without secrets | Flag `1` with secrets |
| --- | --- | --- | --- |
| Vercel Production (`www.kidease.ca`) | `production` | Treated as **off**. No parent chrome, no native prompt, no send. | Armed. Send still needs the vendor call + (SMS) CASL. |
| Vercel Preview / local | `preview` / unset | Override allowed for UI / lab. Send / mint still no-ops without secrets. | Armed. |

Do **not** set `FEATURE_SMS=1`, `FEATURE_PUSH=1`, or `FEATURE_VIDEO=1` on Vercel Production until the matching secrets exist on that same environment. Preview may set them to `1` to exercise Admin → Chat lab.

Parent inbox **Video** stays hidden until `VIDEO_SDK_WIRED` is true (Twilio Video JS SDK). Token mint is not a live call.

## Inventory (gates)

| Flag | Default | Server send / mint | Client / UI | Honest off-state |
| --- | --- | --- | --- | --- |
| `FEATURE_SMS` | off | `sendSms` in `src/lib/server/sms.ts`. No-ops if flag off, secrets missing, or no CASL grant. Waitlist pulse + claim-status SMS. **Programmable SMS (Messages API), not Twilio Verify.** | Consent on profile / search alerts / Plus checkout always (capture before flip). Alerts show a stub until send is armed. | Chat lab + `alertSmsStub`. |
| `FEATURE_PUSH` | off | `sendPushToDevices` (FCM HTTP v1 / APNs). Register `POST /api/push/register` uses **armed** (Production requires secrets). | Native Capacitor only after `getPushClientStatus().enabled`. www never prompts. | Chat lab dry-run. Inbox / www stay silent. |
| `FEATURE_VIDEO` | off | `createVideoRoom` / `createVideoAccessToken`. Admin `/video/lab` may mint to verify credentials. | Inbox Video icon only when `videoSurfaceEnabled` (flag armed **and** `VIDEO_SDK_WIRED`). `/video/$roomId` is honest when off / no secrets / SDK missing. | Coming-soon copy on `/video/$roomId`. |
| `FEATURE_INAPP_CHAT` | off | None. Composer refuses send. | Chat lab disabled composer. Live threads stay on `/inbox`. | `docs/chat.md`. |
| `FEATURE_PROVIDER_SUBSCRIPTIONS` | **on** | Stripe checkout still needs live keys. | Director Subscription tab. | Admin can preview when killed. |
| `SHOW_PAY_CTAS` | **off** | Does not delete Stripe. Checkout still needs live keys **and** this flag (or admin). | Parent Plus, Upgrade, Subscribe, Pro $49 / Network $39 / promote pay buttons. | `/provider/subscription` stays honest: listing and claim stay free. Admin Stripe catalog stays. |

## Why PostHog

PostHog is already wired (`posthog-js`, `VITE_PUBLIC_POSTHOG_KEY` / `POSTHOG_HOST` on Vercel **kidease-git**, legal copy, `isPostHogFlagEnabled` on the client). A thin `POST /flags?v=2` call on the server needs **no extra SDK** and **no personal API key**.

Vercel Flags, Flagsmith, and LaunchDarkly would add another vendor and another secret. Skip them unless we drop PostHog.

Do **not** use these flags for auth, Stripe, or Turnstile. Those stay their own env-gated helpers.

## How Kyle flips a flag (no redeploy)

1. Confirm credentials for that channel exist (Twilio / FCM / APNs). Flags do not invent keys. SMS also needs CASL consent + STOP — see `docs/sms.md`.
2. On Vercel **kidease-git** (Production + Preview), set `POSTHOG_FLAGS_KEY` to the **same public project key** already used as `VITE_PUBLIC_POSTHOG_KEY` (`phc_…`). Optional: `POSTHOG_FLAGS_HOST` if ingest is not `https://us.i.posthog.com`. Redeploy **once** so the server can call PostHog. Leave the key unset to stay env-only.
3. In [PostHog](https://us.posthog.com) → KidEase → **Feature flags** → **New feature flag**.
   - Key must match the env name exactly: `FEATURE_SMS`, `FEATURE_PUSH`, `FEATURE_VIDEO`, `FEATURE_INAPP_CHAT`, `FEATURE_PROVIDER_SUBSCRIPTIONS`, or `SHOW_PAY_CTAS`.
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
| `FEATURE_VIDEO` | no | Default **off**. Leave `0` until Twilio Video credentials exist. |
| `FEATURE_INAPP_CHAT` | no | Default **off**. Chat lab composer stays disabled even if set to `1`. |
| `FEATURE_PROVIDER_SUBSCRIPTIONS` | no | Default **on** when unset. |
| `SHOW_PAY_CTAS` | no | Default **off**. Leave `0` on Production. Set `1` to restore Upgrade / Subscribe chrome. Does not flip SMS / Push / Video. |
| `POSTHOG_FLAGS_KEY` | no | Server-only. Same `phc_…` project key as analytics. Leave blank to disable remote. Never commit a real value. |
| `POSTHOG_FLAGS_HOST` | no | Defaults to `POSTHOG_HOST` or `https://us.i.posthog.com`. |

The app **boots with no remote keys**. Do not invent a personal API key or a second PostHog project.

## What is wired

- `evaluateFeatureFlag` / `smsEnabled` / `pushEnabled` / `videoEnabled` / `inAppChatEnabled` / `providerSubscriptionsEnabled` / `showPayCtas`.
- Safe enablement: `describeChannelReadiness` / `smsArmed` / `pushArmed` / `videoSurfaceEnabled` in `src/lib/channel-readiness.ts`.
- Send / register / mint paths in `src/lib/server/sms.ts`, `push-send.ts`, `push-tokens.ts`, `video.ts`.
- Admin → Chat lab (`/admin-chat`) shows on/off, source (env / PostHog / default), Production-blocked / Preview-override / SDK-not-attached, plus a disabled composer and the flag-name catalog. See `docs/chat.md`.
- Client `isPostHogFlagEnabled` is analytics-only. Server flags are the source of truth for SMS / push / video send gates.
- Web session replay uses a separate client flag, `session-replay-web` (kill switch). See `docs/posthog.md`.

## Later (not this PR)

- Per-user or % rollouts (today the server uses one distinct id).
- A dedicated `/admin-flags` page. Chat lab is enough to read state.
