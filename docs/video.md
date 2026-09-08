# Twilio Video scaffold (Parent Plus)

KidEase video is a **Parent Plus** offer: parent ↔ centre tour or talk. It is **not** free for all parents.

- **Parents** need an active Plus subscription ($7.99/mo or $59/yr) when Stripe is live.
- **Providers** join without paying.
- **Admins** may test without Plus.
- **No recording** in v1 (privacy).
- Monthly **minute caps** are scaffolded only — not enforced yet.

`FEATURE_VIDEO` defaults **off**. Bills / Stripe checkout / SMS paths are untouched.

**Production vs Preview:** on Vercel Production the flag is ignored unless Twilio Video API-key secrets exist. Preview/dev may set `FEATURE_VIDEO=1` to mint a lab token. **Inbox Video stays hidden** until `VIDEO_SDK_WIRED` is true — enabling the flag must not expose a fake call button.

Optional PostHog overlay (no redeploy): see `docs/flags.md`. Env is the fallback when `POSTHOG_FLAGS_KEY` is unset.

When Stripe is **not** live, free parents see honest copy: **Plus required (billing not live)**. Do not pretend a rehearsal Plus pick is a paid subscription.

## Vercel env checklist

Set the same keys on **Production and Preview** (encrypted). Never prefix `VITE_`. Never commit values.

| Name | Required to mint | Notes |
| --- | --- | --- |
| `FEATURE_VIDEO` | yes (`1`) to mint | **Production:** leave `0` until Console credentials exist. **Preview:** may set `1` to test `/video/lab`. Inbox stays hidden until the JS SDK is wired. |
| `TWILIO_ACCOUNT_SID` | yes | Reuse the SMS Account SID (`AC…`). |
| `TWILIO_API_KEY_SID` + `TWILIO_API_KEY_SECRET` | yes | **Required for Video Access Tokens.** Standard or Main key in **US1**. Restricted keys cannot mint tokens. |
| `TWILIO_AUTH_TOKEN` | optional | Needed later if you validate Video status-callback signatures. Keep it if SMS already uses it. |
| `TWILIO_VIDEO_STATUS_CALLBACK_URL` | optional | Exact HTTPS URL for room status events. Not persisted yet. |

Do **not** put `sk_live_` or Twilio secrets in git.

## Console steps

1. Open [console.twilio.com](https://console.twilio.com). Copy Account SID into `TWILIO_ACCOUNT_SID` (same value as SMS).
2. Account → API keys & tokens → create a **Standard** (or Main) key in **US1**. Save `TWILIO_API_KEY_SID` (`SK…`) and `TWILIO_API_KEY_SECRET` once.
3. Do not enable Programmable Video recording, composition, or room recording rules. KidEase v1 sets `RecordParticipantsOnConnect=false`.
4. Put the env names on the Vercel project **kidease-git** (Production + Preview). Redeploy.
5. Confirm Parent Plus prices (`STRIPE_PRICE_PLUS_MONTHLY` / `STRIPE_PRICE_PLUS_YEARLY`) if you will take live Plus charges. Video still fails closed for free parents when `sk_live_` is unset.
6. Enable `FEATURE_VIDEO` in PostHog (preferred — see `docs/flags.md`) or set `FEATURE_VIDEO=1` on Vercel only after the API key is on Vercel.

## What is wired

- Room name is `ke-{thread|booking|claim|admin}-{id}` (inbox Video uses the conversation id).
- `createVideoRoom` / `createVideoAccessToken` in `src/lib/server/video.ts` — no-ops when the flag is off or the API key is missing. Token TTL is 15 minutes.
- Plus gate in `src/lib/video.ts`: live Stripe + `plus_plan=plus` and `plus_status` `active`/`trialing` for parents; providers and admins skip Plus.
- `/video/$roomId` — Join mints a room + token server-side, then shows **scaffold — connect Twilio Video SDK next**. The JWT is not painted on the page.
- Inbox thread Video icon → `/video/{conversationId}` (paywall CTA when the parent is not Plus).
- Admin → Chat lab shows FEATURE_VIDEO on/off, source (env / PostHog), env-name presence (no secret values), a coming-soon / flag-off state, and the Twilio Video next-build checklist. Staff can open `/video/lab`. See `docs/chat.md`.
- `/video/$roomId` shows **coming soon** when `FEATURE_VIDEO` is off, or an honest credentials-missing card. It does not attach the camera SDK or charge Plus.
- `/checkin/$id` stays the local camera preview on a listing. It is not Twilio Video.

## Later (not this PR)

- Wire `@twilio/video` (or the Video JS SDK) on `/video/$roomId` using the minted token.
- Add Twilio hosts to CSP `connect-src` when the SDK is attached (`https://*.twilio.com`, `wss://*.twilio.com`).
- Enforce monthly minute limits (hook already returns `enforced: false`).
- Persist room status-callback rows.
- Camera / microphone `Permissions-Policy` on `/video` only, if the global policy stays locked down.
