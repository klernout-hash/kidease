# Twilio Video scaffold (Parent Plus)

KidEase video is a **Parent Plus** offer: parent ↔ centre tour or talk. It is **not** free for all parents.

- **Parents** need an active Plus subscription ($7.99/mo or $59/yr) when Stripe is live.
- **Providers** join without paying.
- **Admins** may test without Plus.
- **No recording** in v1 (privacy).
- Monthly **minute caps** are scaffolded only — not enforced yet.

`FEATURE_VIDEO` defaults **off**. Bills / Stripe checkout / SMS paths are untouched.

When Stripe is **not** live, free parents see honest copy: **Plus required (billing not live)**. Do not pretend a rehearsal Plus pick is a paid subscription.

## Vercel env checklist

Set the same keys on **Production and Preview** (encrypted). Never prefix `VITE_`. Never commit values.

| Name | Required to mint | Notes |
| --- | --- | --- |
| `FEATURE_VIDEO` | yes (`1`) | Leave `0` until Console credentials exist. |
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
6. Set `FEATURE_VIDEO=1` only after the API key is on Vercel.

## What is wired

- Room name is `ke-{thread|booking|claim|admin}-{id}` (inbox Video uses the conversation id).
- `createVideoRoom` / `createVideoAccessToken` in `src/lib/server/video.ts` — no-ops when the flag is off or the API key is missing. Token TTL is 15 minutes.
- Plus gate in `src/lib/video.ts`: live Stripe + `plus_plan=plus` and `plus_status` `active`/`trialing` for parents; providers and admins skip Plus.
- `/video/$roomId` — Join mints a room + token server-side, then shows **scaffold — connect Twilio Video SDK next**. The JWT is not painted on the page.
- Inbox thread Video icon → `/video/{conversationId}` (paywall CTA when the parent is not Plus).
- Admin → Chat lab shows FEATURE_VIDEO on/off and whether env names are present (no secret values). Staff can open `/video/lab`.
- `/checkin/$id` stays the local camera preview on a listing. It is not Twilio Video.

## Later (not this PR)

- Wire `@twilio/video` (or the Video JS SDK) on `/video/$roomId` using the minted token.
- Add Twilio hosts to CSP `connect-src` when the SDK is attached (`https://*.twilio.com`, `wss://*.twilio.com`).
- Enforce monthly minute limits (hook already returns `enforced: false`).
- Persist room status-callback rows.
- Camera / microphone `Permissions-Policy` on `/video` only, if the global policy stays locked down.
