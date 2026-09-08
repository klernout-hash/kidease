# Twilio SMS scaffold (Canada)

KidEase sends **transactional** SMS only: vacancy alerts, claim-status updates, and (later) bill/pay reminders. Not marketing blasts.

`FEATURE_SMS` defaults **off**. Email (Resend / SendGrid / Titan) still works when SMS is off or credentials are missing.

Optional PostHog overlay (no redeploy): see `docs/flags.md`. Env is the fallback when `POSTHOG_FLAGS_KEY` is unset. Do not enable SMS here by default.

Bills / Stripe checkout paths are untouched in this scaffold.

## CASL + STOP (before you flip the flag)

This repo now stores **express consent** before a parent or provider SMS can leave Twilio.

- Capture is unchecked by default on **profile**, **search-alert prefs**, and **Plus / bill checkout**. Not required to search, book, or pay.
- Neon tables: `casl_consents` (current grant), `casl_consent_events` (who / when / what wording), `casl_address_blocks` (STOP / unsubscribe).
- `sendSms` fails closed for `audience: "user"` unless `consentGranted` is true. Admin SMS to Kyle uses `audience: "internal"`.
- Claim-status SMS looks up `casl_consents` + the address block list. Search-alert **email** is also gated on stored email-service consent and includes List-Unsubscribe.
- Honour **STOP / ARRÊT** immediately: Messaging Service Advanced Opt-Out **and** `POST /api/sms/inbound` (persists the withdrawal). Public page: `/unsubscribe`.
- Do not buy lists or send promotional “spots near you” campaigns from this path.
- Full **CRTC / Canadian carrier registration** (if required for your traffic mix) is Console / Dashboard operations later — not an app deploy.

## Vercel env checklist

Set the same keys on **Production and Preview** (encrypted). Never prefix `VITE_`. Never commit values.

| Name | Required to send | Notes |
| --- | --- | --- |
| `FEATURE_SMS` | yes (`1`) | Leave `0` until credentials + a Canadian sender **and** consent copy are live. |
| `TWILIO_ACCOUNT_SID` | yes | Console dashboard (`AC…`). |
| `TWILIO_AUTH_TOKEN` | auth-token mode **or** webhooks | Required to validate `X-Twilio-Signature`. Keep it even if you send with an API key. |
| `TWILIO_API_KEY_SID` + `TWILIO_API_KEY_SECRET` | API-key mode | Preferred for production send. `SK…` + secret. |
| `TWILIO_MESSAGING_SERVICE_SID` | recommended | `MG…`. Prefer this over a raw From for Canada. |
| `TWILIO_FROM_NUMBER` | if no Messaging Service | E.164 Canadian number you own in Twilio. |
| `TWILIO_STATUS_CALLBACK_URL` | optional | Exact HTTPS URL, e.g. `https://www.kidease.ca/api/sms/status`. |
| `TWILIO_INBOUND_CALLBACK_URL` | optional | Exact HTTPS URL Twilio signs for STOP, e.g. `https://www.kidease.ca/api/sms/inbound`. |

Do **not** put `sk_live_` or Twilio secrets in git.

## Console steps

1. Create a Twilio account at [console.twilio.com](https://console.twilio.com). Copy Account SID. Copy Auth Token into the Vercel secret — do not paste it into the repo.
2. (Production) Account → API keys & tokens → create a **Standard** or **Restricted** key. Save `TWILIO_API_KEY_SID` + `TWILIO_API_KEY_SECRET` once.
3. Buy or port a **Canadian** SMS-capable number, **or** create a Messaging Service and add that number to the sender pool.
4. Messaging → Services → your service → Integration: set Delivery Status Callback to `TWILIO_STATUS_CALLBACK_URL`. Enable sticky sender + Advanced Opt-Out.
5. Point the Messaging Service inbound webhook at `TWILIO_INBOUND_CALLBACK_URL` (`/api/sms/inbound`) so STOP is stored in Neon, not only at the carrier.
6. Messaging → Settings → Geo permissions: allow **Canada** (disable countries you do not serve — SMS pumping).
7. Put the env names on the Vercel project **kidease-git** (Production + Preview). Redeploy. Confirm `0036_casl_consents.sql` applied (`npm run db:migrate` runs on deploy).
8. **Upgrade from trial** before texting unverified Canadian mobiles. Trial can only reach verified numbers.
9. Confirm parents and directors can grant/withdraw SMS on `/account?tab=profile` and Family desk → Search alerts. Then — and only then — enable `FEATURE_SMS` in PostHog (preferred) or set `FEATURE_SMS=1` on Vercel. See `docs/flags.md`.

## What is wired

- `sendSms({ to, body })` in `src/lib/server/sms.ts` — no-ops when the flag is off, env is incomplete, or a user SMS lacks stored consent; validates E.164; never logs the auth token.
- Admin claim decision (`decideCentre`) may SMS the provider profile mobile **only after** a CASL grant. Email still sends if SMS skips.
- Platform admin SMS (Kyle) uses `audience: "internal"` and is still gated by the feature flag.
- `POST /api/sms/status` validates Twilio signatures (needs `TWILIO_AUTH_TOKEN`) and returns `204`. No delivery table yet.
- `POST /api/sms/inbound` persists STOP / START. `/unsubscribe` and `GET|POST /api/unsubscribe` honour email one-click.
- Admin → Chat lab shows FEATURE_SMS on/off, source (env / PostHog), and whether env names are present (no secret values).
- Waitlist pulse (`docs/waitlist-pulse.md`) texts matched parents only after a stored CASL grant. The job still no-ops while `FEATURE_SMS` is off.

## Later (not this PR)

- Bill / pay reminder SMS (do not mix into Stripe webhook apply).
- Persist status-callback rows.
- Street mailing address on CASL copy if Kyle adds one (today: KidEase, Winnipeg, Manitoba + support@kidease.ca).
