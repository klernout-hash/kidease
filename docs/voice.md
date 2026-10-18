# Twilio Voice (parent ↔ daycare)

In-app calls go through Twilio. KidEase does not show or dial a personal mobile number.

The public toll-free number can also receive a call: a short greeting names KidEase, then KidEase tries to ring the daycare inside the product. If nobody answers, the caller can leave a voicemail. The recording id is stored. The audio file stays in Twilio.

`FEATURE_SMS` does not gate voice. Voice turns on when the API key and TwiML App are set.

## Vercel env checklist

Set these on **Production and Preview**. Never prefix `VITE_`. Never commit values.

| Name | Required | Already in code | Notes |
| --- | --- | --- | --- |
| `TWILIO_ACCOUNT_SID` | yes | yes (SMS) | `AC…`. Same account as SMS and Video. |
| `TWILIO_AUTH_TOKEN` | yes | yes (SMS webhooks) | Validates `X-Twilio-Signature` on `/api/voice/*`. |
| `TWILIO_API_KEY_SID` | yes | yes (Video tokens) | `SK…`. Standard or Main key in **US1**. |
| `TWILIO_API_KEY_SECRET` | yes | yes (Video tokens) | Shown once in the Console. |
| `TWILIO_TWIML_APP_SID` | yes | new | `AP…`. Voice request URL below. |
| `TWILIO_PHONE_NUMBER` | yes for the toll-free path | new name; `TWILIO_FROM_NUMBER` still works as a fallback | E.164 approved toll-free. |
| `TWILIO_MESSAGING_SERVICE_SID` | SMS only | yes | Not used to place the call. |
| `TWILIO_VOICE_INCOMING_URL` | recommended | new | Exact `https://www.kidease.ca/api/voice/incoming`. |
| `TWILIO_VOICE_CONNECT_URL` | recommended | new | Exact `https://www.kidease.ca/api/voice/connect`. |
| `TWILIO_VOICE_RECORDING_URL` | recommended | new | Exact `https://www.kidease.ca/api/voice/recording`. |

## Twilio Console settings

1. **API key.** Account → API keys & tokens → Standard (or Main) key in **US1**. Save `TWILIO_API_KEY_SID` and `TWILIO_API_KEY_SECRET`. A restricted key cannot mint access tokens.
2. **TwiML App.** Voice → TwiML apps → Create. Voice request URL: `https://www.kidease.ca/api/voice/connect` (HTTP POST). Copy the `AP…` SID into `TWILIO_TWIML_APP_SID`.
3. **Toll-free voice webhook.** Phone Numbers → the approved toll-free → Voice configuration. A call comes in: Webhook, HTTP POST, `https://www.kidease.ca/api/voice/incoming`. This was empty. Set it or phone calls to the toll-free number do nothing.
4. **Messaging Service** (already set): inbound `https://www.kidease.ca/api/sms/inbound`, status `https://www.kidease.ca/api/sms/status`. Leave those. SMS still needs `FEATURE_SMS=1` plus consent.

## What a parent or daycare sees

On a message thread, **Call** opens `/call/{conversation}`. One button starts the call. The other person must open the same thread and tap Call so their browser can ring. Hang up and mute are on the call screen. A daycare never sees the parent’s mobile, and a parent never sees a private staff number.

Admin can open the same call. It rings both sides. Admin does not get the parent’s or the daycare’s other buttons.
