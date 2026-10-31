# Feature readiness

Checked Oct 31, 2026. These paths already exist. This note says how to prove them and which flags stay off.

Owner rule the same day: do **not** build, enable, or turn on in-app subscriptions. That includes Apple In-App Purchase, Google Play Billing, `SUBSCRIPTIONS_ENABLED`, and `SHOW_PAY_CTAS`. Leave the existing subscription code and those flags off.

## Demo accounts

Loopback only, when `E2E_ROLE_FIXTURE=1`:

| Role | Email | Password |
| --- | --- | --- |
| Parent | `e2e-parent@kidease.test` | `E2e-role-fixture-pass-1` |
| Daycare | `e2e-provider@kidease.test` | `E2e-role-fixture-pass-1` |

Seed with `POST /api/e2e-seed` on a loopback preview. Do not use these on production.

## What is ready without a flag flip

| Check | Where | How to prove it |
| --- | --- | --- |
| 48-hour spot offer | `src/lib/spot-offers.ts` | Offer window is 48 hours. The parent answers on `/parent/spot-offers`. |
| Multi-waitlist rank | `placeInLine` in the same file | Place in line is sign-up order at that centre. |
| Tour booking | `bookTourSlot` | Guest is sent to sign in. A signed-in parent can book a posted time. |
| Commute search | `src/lib/osm-map.ts` | The map uses OpenStreetMap tiles. Google Maps stays off. |
| T778 and RL-24 samples | `src/lib/tax-receipts.ts` | The daycare desk downloads a sample from the numbers the centre typed. |
| DocuSign sandbox | `src/lib/server/contracts.ts` | Without JWT, envelopes stay `demo_…` and in-app sign still works at `/sign/{id}`. |

## Flags that stay off

| Flag | Default | Do this |
| --- | --- | --- |
| `SUBSCRIPTIONS_ENABLED` | off | Leave off. No checkout. |
| `SHOW_PAY_CTAS` | off | Leave off. Upgrade buttons stay hidden. |
| `FEATURE_INAPP_CHAT` | off | Leave off. Live parent and centre threads are already on `/inbox`. |
| `FEATURE_VIDEO` | off | Leave off until Twilio Video secrets exist, and not on production until the safe-enablement gate is armed. |
| `FEATURE_SPOT_OFFER_MAIL` | off | Leave off until Kyle wants the 48-hour offer email. The offer still shows in the account. |
| `FEATURE_OPEN_SPOTS_CHECKIN_MAIL` | off | Leave off until Kyle wants the weekly email. |
| `FEATURE_OPEN_SPOTS_CHECKIN_SMS` | off | Leave off. SMS also needs `FEATURE_SMS` and CASL consent. |
| `FEATURE_SMS` | off | Leave off. Texts go only to people who consented. |
| `FEATURE_PUSH` | off | Leave off. Push stays for version 1.1. Do not add APNs or FCM setup in this pass. |

`FEATURE_PROVIDER_SUBSCRIPTIONS` is already on in code and only shows the director Subscription tab. Checkout still needs `SUBSCRIPTIONS_ENABLED`, which stays off.

## Later, only if Kyle asks

1. Spot-offer email: `FEATURE_SPOT_OFFER_MAIL=1` after the wording is the one he wants.
2. Weekly open-spots email: `FEATURE_OPEN_SPOTS_CHECKIN_MAIL=1`.
3. Video: secrets first, then `FEATURE_VIDEO=1` on preview. Production stays disarmed until he says so.
4. Inspection rows, on their own pull request: import a public file, then `FEATURE_INSPECTION_HISTORY=1`.

Do not flip subscription flags in that list.
