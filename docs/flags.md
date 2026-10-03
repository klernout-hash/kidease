# Feature flags (env + optional PostHog)

KidEase product gates (`FEATURE_SMS`, `FEATURE_PUSH`, `FEATURE_VIDEO`, `FEATURE_INAPP_CHAT`, `FEATURE_PROVIDER_SUBSCRIPTIONS`, `SHOW_PAY_CTAS`, `SUBSCRIPTIONS_ENABLED`, `FOUNDING_BADGE_ENABLED`, `FEATURE_OPEN_SPOT_ALERTS`, `FEATURE_SPOT_OFFER_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_SMS`) go through `src/lib/flags.ts`.

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
| `FEATURE_INAPP_CHAT` | off | None. Composer refuses send. `askKidEase` stays gated on this flag. | Chat lab only. The parent helper bubble uses the `parent-helper` flag. Live parent ↔ centre threads stay on `/inbox`. | `docs/chat.md`. |
| `FEATURE_PROVIDER_SUBSCRIPTIONS` | **on** | Stripe checkout still needs live keys. | Director Subscription tab. | Admin can preview when killed. |
| `SHOW_PAY_CTAS` | **off** | Does not delete Stripe. Checkout still needs live keys, `SUBSCRIPTIONS_ENABLED`, and this flag (or admin). | Parent Plus, Upgrade, Subscribe, Pro / Network / promote pay buttons. | `/provider/subscription` stays honest: listing and claim stay free. Admin Stripe catalog stays. |
| `SUBSCRIPTIONS_ENABLED` | **off** | Checkout functions refuse every role, including admin. Stripe code, webhooks, and price tables stay. No charge is created. | `/plans` shows the free founding period. Upgrade and checkout buttons stay hidden. Daycare desk tools (messages, tours, 90-day stats, multi-site totals) stay unlocked. Search pins are not given away. | Set `1` (env or PostHog) and the subscription flow from before this flag works again. |
| `FOUNDING_BADGE_ENABLED` | **on** | None. | Founding member badge on listing cards, the listing page, and the daycare desk. | Badge hides. `daycares.founding_member` stays so a later discount can be honoured. No percent and no end date are stored. |
| `FEATURE_OPEN_SPOT_ALERTS` | off | Vacancy emails in `runSearchAlertJob`. Sends only when the flag is on and CASL allows the email. | Parents can still save a search (city and child age). In-app notices for a new centre stay. | Email about a newly posted open spot stays off. |
| `FEATURE_SPOT_OFFER_MAIL` | **off** | `sendTransactionalMail` for a 48-hour spot offer. No send when off. | Offer still appears on `/parent/spot-offers`. Desk says email is off. | Families answer in the account or by signed link. |
| `FEATURE_OPEN_SPOTS_CHECKIN_MAIL` | off | Weekly email to claimed daycares. No-ops while off. | Signed link page `/spots/$token`. | No email goes out. |
| `FEATURE_OPEN_SPOTS_CHECKIN_SMS` | off | Weekly SMS. Also needs `FEATURE_SMS`, CASL consent, and Twilio. Toll-free is not approved. | Same signed link. Label the text path coming soon. | No SMS goes out. |

## Why PostHog

PostHog is already wired (`posthog-js`, `VITE_PUBLIC_POSTHOG_KEY` / `POSTHOG_HOST` on Vercel **kidease-git**, legal copy, `isPostHogFlagEnabled` on the client). A thin `POST /flags?v=2` call on the server needs **no extra SDK** and **no personal API key**.

Vercel Flags, Flagsmith, and LaunchDarkly would add another vendor and another secret. Skip them unless we drop PostHog.

Do **not** use these flags for auth or Turnstile. Those stay their own env-gated helpers.

`SUBSCRIPTIONS_ENABLED` is the one switch for whether paid plans are offered. It does not hold a Stripe secret. Turning it on does not invent a price. Checkout still needs `stripeChargesLive()` and the matching `STRIPE_PRICE_*` id. Leave it unset (or `0`) on Production during the free founding period. Set `1` when Kyle wants paid extras. PostHog key `SUBSCRIPTIONS_ENABLED` flips it without a redeploy once `POSTHOG_FLAGS_KEY` is set.

## How Kyle flips a flag (no redeploy)

1. Confirm credentials for that channel exist (Twilio / FCM / APNs). Flags do not invent keys. SMS also needs CASL consent + STOP — see `docs/sms.md`.
2. On Vercel **kidease-git** (Production + Preview), set `POSTHOG_FLAGS_KEY` to the **same public project key** already used as `VITE_PUBLIC_POSTHOG_KEY` (`phc_…`). Optional: `POSTHOG_FLAGS_HOST` if ingest is not `https://us.i.posthog.com`. Redeploy **once** so the server can call PostHog. Leave the key unset to stay env-only.
3. In [PostHog](https://us.posthog.com) → KidEase → **Feature flags** → **New feature flag**.
   - Key must match the env name exactly: `FEATURE_SMS`, `FEATURE_PUSH`, `FEATURE_VIDEO`, `FEATURE_INAPP_CHAT`, `FEATURE_PROVIDER_SUBSCRIPTIONS`, `SHOW_PAY_CTAS`, `SUBSCRIPTIONS_ENABLED`, `FOUNDING_BADGE_ENABLED`, `FEATURE_OPEN_SPOT_ALERTS`, `FEATURE_SPOT_OFFER_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_MAIL`, or `FEATURE_OPEN_SPOTS_CHECKIN_SMS`.
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
| `FEATURE_INAPP_CHAT` | no | Default **off**. Chat lab only. The parent helper bubble is a separate PostHog flag. Do not flip this to enable parent ↔ centre `/inbox` — that path is already live. |
| `FEATURE_PROVIDER_SUBSCRIPTIONS` | no | Default **on** when unset. |
| `SHOW_PAY_CTAS` | no | Default **off**. Leave `0` on Production. Set `1` to restore Upgrade / Subscribe chrome after `SUBSCRIPTIONS_ENABLED=1`. Does not flip SMS / Push / Video. |
| `SUBSCRIPTIONS_ENABLED` | no | Default **off**. Leave unset during the free founding period. Set `1` to restore paid plans and checkout. Does not set a price. |
| `FOUNDING_BADGE_ENABLED` | no | Default **on**. Set `0` to hide the Founding member badge. The database marker stays. |
| `FEATURE_OPEN_SPOT_ALERTS` | no | Default **off**. Leave `0` until Kyle wants email when a saved search matches a newly posted open spot. |
| `FEATURE_SPOT_OFFER_MAIL` | no | Default **off**. Leave `0` until you want offer emails. The waitlist still works. |
| `FEATURE_OPEN_SPOTS_CHECKIN_MAIL` | no | Default **off**. Leave `0` until you want the weekly open-spots email. |
| `FEATURE_OPEN_SPOTS_CHECKIN_SMS` | no | Default **off**. Leave `0`. Toll-free is not approved. Also needs `FEATURE_SMS`. |
| `POSTHOG_FLAGS_KEY` | no | Server-only. Same `phc_…` project key as analytics. Leave blank to disable remote. Never commit a real value. |
| `POSTHOG_FLAGS_HOST` | no | Defaults to `POSTHOG_HOST` or `https://us.i.posthog.com`. |

The app **boots with no remote keys**. Do not invent a personal API key or a second PostHog project.

## What is wired

- `evaluateFeatureFlag` / `smsEnabled` / `pushEnabled` / `videoEnabled` / `inAppChatEnabled` / `providerSubscriptionsEnabled` / `showPayCtas` / `subscriptionsEnabled` / `foundingBadgeEnabled` / `openSpotAlertsEnabled`.
- Safe enablement: `describeChannelReadiness` / `smsArmed` / `pushArmed` / `videoSurfaceEnabled` in `src/lib/channel-readiness.ts`.
- Send / register / mint paths in `src/lib/server/sms.ts`, `push-send.ts`, `push-tokens.ts`, `video.ts`.
- Admin → Chat lab (`/admin-chat`) shows on/off, source (env / PostHog / default), Production-blocked / Preview-override / SDK-not-attached, plus a disabled composer and the flag-name catalog. See `docs/chat.md`.
- Client `isPostHogFlagEnabled` is analytics-only. Server flags are the source of truth for SMS / push / video send gates.
- Web session replay uses a separate client flag, `session-replay-web` (kill switch). See `docs/posthog.md`.

## Later (not this PR)

- Per-user or % rollouts (today the server uses one distinct id).
- A dedicated `/admin-flags` page. Chat lab is enough to read state.
