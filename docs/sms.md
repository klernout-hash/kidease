# Twilio SMS scaffold (Canada)

KidEase sends **transactional** SMS only: vacancy alerts, claim-status updates, and (later) bill/pay reminders. Not marketing blasts.

`FEATURE_SMS` defaults **off**. Email (Resend / SendGrid / Titan) still works when SMS is off or credentials are missing.

Bills / Stripe checkout paths are untouched in this scaffold.

## CASL + STOP (before you flip the flag)

- Collect **express consent** (or CASL-implied consent for an existing business relationship / requested service) before texting a parent or provider mobile.
- Store who, when, and how they opted in. Honour **STOP / ARRÊT** immediately — enable Advanced Opt-Out on the Messaging Service.
- Do not buy lists or send promotional “spots near you” campaigns from this path.
- Full **CRTC / Canadian carrier registration** (if required for your traffic mix) is Console / Dashboard operations later — not an app deploy.

## Vercel env checklist

Set the same keys on **Production and Preview** (encrypted). Never prefix `VITE_`. Never commit values.

| Name | Required to send | Notes |
| --- | --- | --- |
| `FEATURE_SMS` | yes (`1`) | Leave `0` until credentials + a Canadian sender exist. |
| `TWILIO_ACCOUNT_SID` | yes | Console dashboard (`AC…`). |
| `TWILIO_AUTH_TOKEN` | auth-token mode **or** webhooks | Required to validate `X-Twilio-Signature`. Keep it even if you send with an API key. |
| `TWILIO_API_KEY_SID` + `TWILIO_API_KEY_SECRET` | API-key mode | Preferred for production send. `SK…` + secret. |
| `TWILIO_MESSAGING_SERVICE_SID` | recommended | `MG…`. Prefer this over a raw From for Canada. |
| `TWILIO_FROM_NUMBER` | if no Messaging Service | E.164 Canadian number you own in Twilio. |
| `TWILIO_STATUS_CALLBACK_URL` | optional | Exact HTTPS URL, e.g. `https://www.kidease.ca/api/sms/status`. |

Do **not** put `sk_live_` or Twilio secrets in git.

## Console steps

1. Create a Twilio account at [console.twilio.com](https://console.twilio.com). Copy Account SID. Copy Auth Token into the Vercel secret — do not paste it into the repo.
2. (Production) Account → API keys & tokens → create a **Standard** or **Restricted** key. Save `TWILIO_API_KEY_SID` + `TWILIO_API_KEY_SECRET` once.
3. Buy or port a **Canadian** SMS-capable number, **or** create a Messaging Service and add that number to the sender pool.
4. Messaging → Services → your service → Integration: set Delivery Status Callback to `TWILIO_STATUS_CALLBACK_URL`. Enable sticky sender + opt-out.
5. Messaging → Settings → Geo permissions: allow **Canada** (disable countries you do not serve — SMS pumping).
6. Put the env names on the Vercel project **kidease-git** (Production + Preview). Redeploy.
7. **Upgrade from trial** before texting unverified Canadian mobiles. Trial can only reach verified numbers.
8. Confirm CASL consent copy on claim / account phone fields, then set `FEATURE_SMS=1`.

## What is wired

- `sendSms({ to, body })` in `src/lib/server/sms.ts` — no-ops when the flag is off or env is incomplete; validates E.164; never logs the auth token.
- Admin claim decision (`decideCentre`) may SMS the provider profile mobile. Email still sends if SMS skips.
- Platform admin SMS (Kyle) uses the same helper and is also gated.
- `POST /api/sms/status` validates Twilio signatures (needs `TWILIO_AUTH_TOKEN`) and returns `204`. No delivery table yet.
- Admin → Chat lab shows FEATURE_SMS on/off and whether env names are present (no secret values).

## Later (not this PR)

- Vacancy SMS to waitlisted parents (need stored mobiles + consent).
- Bill / pay reminder SMS (do not mix into Stripe webhook apply).
- Persist status-callback rows.
- Inbound STOP webhook beyond Messaging Service Advanced Opt-Out.
