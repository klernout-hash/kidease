# Feature flags (env + optional PostHog)

KidEase product gates (`FEATURE_SMS`, `FEATURE_PUSH`, `FEATURE_VIDEO`, `FEATURE_INAPP_CHAT`, `FEATURE_PROVIDER_SUBSCRIPTIONS`, `SHOW_PAY_CTAS`, `SUBSCRIPTIONS_ENABLED`, `FOUNDING_BADGE_ENABLED`, `FEATURE_OPEN_SPOT_ALERTS`, `FEATURE_SPOT_OFFER_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_SMS`, `FEATURE_QC_HOME_DAYCARES`, `FEATURE_AREA_WAITLIST_ALERTS`, `FEATURE_INSPECTION_HISTORY`, `FEATURE_PROVINCIAL_VACANCY_INDEX`, `FEATURE_REVIEW_REPORTS`, `FEATURE_TOUR_PIPELINE`, `FEATURE_NEED_CARE_FAST`, `FEATURE_INCLUSIVE_FILTERS`, `FEATURE_ECE_JOBS`, `FEATURE_DIGITAL_ATTENDANCE`, `FEATURE_STAFF_SCHEDULING`, `FEATURE_LEARNING_PORTFOLIOS`, `FEATURE_ORG_DASHBOARD`, `FEATURE_PRIVATE_PHOTO_FEED`, `FEATURE_PRODUCT_EVENTS`, `FEATURE_NCF_STREET`, `FEATURE_PRIVATE_MEDIA`, `FEATURE_QR_KIOSK`, `FEATURE_PROVINCE_REPORTS`, `FEATURE_GOV_SCOPES`, `FEATURE_FR_CA`) go through `src/lib/flags.ts`.

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
| `FEATURE_PUSH` | off | `dispatchCustomerAlert` sends FCM / APNs and, when the VAPID pair exists, website Web Push. Register `POST /api/push/register` uses **armed** (Production requires a secret). | Signed-in www may prompt only when armed and both VAPID keys exist. Unsigned visitors never prompt. Native Capacitor after `getPushClientStatus().enabled`. | Chat lab dry-run. If push cannot send, email and the in-app bell still run. |
| `FEATURE_VIDEO` | off | `createVideoRoom` / `createVideoAccessToken`. Admin `/video/lab` may mint to verify credentials. | Inbox Video icon only when `videoSurfaceEnabled` (flag armed **and** `VIDEO_SDK_WIRED`). `/video/$roomId` is honest when off / no secrets / SDK missing. | Coming-soon copy on `/video/$roomId`. |
| `FEATURE_INAPP_CHAT` | off | None. Composer refuses send. `askKidEase` stays gated on this flag. | Chat lab only. The parent helper bubble uses the `parent-helper` flag. Live parent ↔ centre threads stay on `/inbox`. | `docs/chat.md`. |
| `FEATURE_PROVIDER_SUBSCRIPTIONS` | **on** | Stripe checkout still needs live keys. | Director Subscription tab. | Admin can preview when killed. |
| `SHOW_PAY_CTAS` | **off** | Does not delete Stripe. Checkout still needs live keys, `SUBSCRIPTIONS_ENABLED`, and this flag (or admin). | Parent Plus, Upgrade, Subscribe, Pro / Network / promote pay buttons. | `/provider/subscription` stays honest: listing and claim stay free. Admin Stripe catalog stays. |
| `SUBSCRIPTIONS_ENABLED` | **off** | Checkout functions refuse every role, including admin. Stripe code, webhooks, and price tables stay. No charge is created. | Plans, pricing, and Upgrade stay hidden for parents and daycares: footer and guest menu `/plans`, parent Upgrade (sidebar, header menu, account, and `/parent?tab=subscription`), daycare Current plan, and “included on every plan”. Direct visits to `/plans`, `/fr/plans`, `/pricing`, and `/fr/pricing` redirect home. `/provider/subscription` redirects to Today. Daycare desk tools stay unlocked. Signed-in parents keep Parent Plus tools (compare 10, and video when `FEATURE_VIDEO` is on). SMS and push stay behind their own flags. Search pins are not given away. | Set `1` (env or PostHog) after the app stores approve KidEase. Those entry points come back. Compare returns to 5 on Free and 10 on Parent Plus. |
| `FOUNDING_BADGE_ENABLED` | **on** | None. | Founding member badge on listing cards, the listing page, and the daycare desk. | Badge hides. `daycares.founding_member` stays so a later discount can be honoured. No percent and no end date are stored. |
| `FEATURE_OPEN_SPOT_ALERTS` | off | Vacancy emails in `runSearchAlertJob`. Sends only when the flag is on and CASL allows the email. | Parents can still save a search (city and child age). In-app notices for a new centre stay. | Email about a newly posted open spot stays off. |
| `FEATURE_SPOT_OFFER_MAIL` | **off** | `sendTransactionalMail` for a 48-hour spot offer. No send when off. | Offer still appears on `/parent/spot-offers`. Desk says email is off. | Families answer in the account or by signed link. |
| `FEATURE_OPEN_SPOTS_CHECKIN_MAIL` | off | Weekly email to claimed daycares. No-ops while off. | Signed link page `/spots/$token`. | No email goes out. |
| `FEATURE_OPEN_SPOTS_CHECKIN_SMS` | off | Weekly SMS. Also needs `FEATURE_SMS`, consent, and Twilio. The toll-free sender is approved. | Same signed link. | No SMS goes out while this flag is off. |
| `FEATURE_QC_HOME_DAYCARES` | off | None. No email or SMS to these providers. | `/milieux-familiaux` when on. Area circle, not a street pin. | Page says the list is not published yet. |
| `FEATURE_AREA_WAITLIST_ALERTS` | off | Area-waitlist email in `runAreaWaitlistAlerts`. Kyle approved the wording. No send while this is off. | Parents can join an area waitlist. The in-app bell still records a match. | Email stays off. Area texts need `FEATURE_SMS` and CASL, not `plus_plan=alerts`. Saved-search SMS still needs that plan. Push stays on `FEATURE_PUSH`. |
| `FEATURE_INSPECTION_HISTORY` | off | Read cached `listing_inspections` rows for Ontario, British Columbia, and Alberta. | Listing shows the date, outcome, and a link to the public page. | Hidden. The official registry link stays. |
| `FEATURE_PROVINCIAL_VACANCY_INDEX` | off | Confirm history rows and `spots_updated_at` on a real confirm or spot-count change. | Per-province pages on `/vacancy-index?province=mb` (and `/fr`). Freshness bands and the province file total. | National `/vacancy-index` stays. No email or SMS. |
| `FEATURE_CURRICULUM_PACK` | off | Province goals, story notes, plans, and coverage. | Learning desk on `/provider?desk=learning`. | Hidden. Listing is unchanged. |
| `FEATURE_CURRICULUM_PACK_LIVE` | off | Show a published story to the enrolled parent. | Parent timeline and replies. | Publish is written to the log only. |
| `FEATURE_STORY_CORNER` | off | Read Global Digital Library CC BY books stored on disk. StoryWeaver stays off. Unite for Literacy is a link out. | Story corner inside the learning desk. | Shelf hidden. No remote book file is loaded. |

Automation-pack flags (`FEATURE_POSTHOG_ERRORS`, `FEATURE_OPS_ALERTS`, `FEATURE_CRON_HEARTBEATS`, `FEATURE_INVOICE_REMINDERS`, `FEATURE_PAYMENT_DUNNING`, `FEATURE_MISSING_INFO_REMINDERS`, `FEATURE_DAYCARE_ONBOARDING`, `FEATURE_CLAIM_LISTING_REMINDERS`, `FEATURE_STALE_OPEN_SPOTS`, `FEATURE_POST_TOUR_FOLLOWUP`, `FEATURE_ENROLMENT_REVIEW`, `FEATURE_NEON_BACKUP`) default **off**. Turning one on is dry-run until `FEATURE_*_LIVE=1`. See `docs/automations.md`. Do not turn on `SUBSCRIPTIONS_ENABLED`, `SHOW_PAY_CTAS`, or in-app purchases.
| `FEATURE_REVIEW_REPORTS` | off | `reportListingReview` writes a safety-queue row for one published review. | Report button on the listing. Search cards, the profile, and compare can show a rating from the first review. | Three-review summaries stay. No email or SMS. |
| `FEATURE_TOUR_PIPELINE` | off | Moves the tour reminder when the time changes. Adds a calendar file to the booking email. Allows a no-show mark. | No-show button on the tour card. | Booking, confirm, decline, and the browser .ics download stay. Texts still need `FEATURE_SMS` and CASL. |
| `FEATURE_NEED_CARE_FAST` | off | Sort the urgent list by open spots, then distance. | The page says spots come first and that maps are not Google. | Closest-first stays. Fresh 7-day spots stay. No SMS. |
| `FEATURE_INCLUSIVE_FILTERS` | off | None. | Halal, kosher, nut-free, vegetarian, and extra support on the centre form, in English and French. | Search chips stay. Centres cannot add those words until this is on. |
| `FEATURE_ECE_JOBS` | off | Insert a role and an application. No Stripe call. | Job list on /jobs, apply on the listing, applicant list for the centre. | The interest form stays. No charge. Subscriptions stay off. |
| `FEATURE_DIGITAL_ATTENDANCE` | off | `saveAttendance` from the check-in page. | Arrival and pickup form. No camera. | The camera preview stays. Daily care on the parent desk stays. No SMS. |
| `FEATURE_STAFF_SCHEDULING` | off | Save shifts and ECE certificates. Email the centre when a certificate is inside 60 days of expiry. | Daycare desk → Employees → Staff shifts. | The page says the tool is off. |
| `FEATURE_LEARNING_PORTFOLIOS` | off | Save a private learning story for an enrolled child. | Daycare desk and the parent's Stories link. | The page says the tool is off. Nothing is public. |
| `FEATURE_ORG_DASHBOARD` | off | Read capacity, enrolled bookings, and confirmed open spots for centres you run. | Daycare desk → Your centres. | The page says the tool is off. |
| `FEATURE_PRIVATE_PHOTO_FEED` | off | Classroom photo posts require an enrolled booking and photo consent. Parent feed requires an active enrolment. | Consent card on the daily feed. | The feed page stays. Photos are not public. No SMS. The thread email does not attach the photo. |
| `FEATURE_GOV_PORTAL` | off | Footer link “For governments”. `/gov` sign-in stays available either way. | A small footer link when this is on. Not in the phone app. | No footer link. The government desk is not linked from public nav. |
| `FEATURE_PRODUCT_EVENTS` | off | Server capture for enrolment, invoice paid, and area waitlist. | Browser events for signup, search, listing view, waitlist, enrolment, and claim. | No new event names are sent. |
| `FEATURE_NCF_STREET` | off | Geocode a street address with OpenStreetMap Nominatim and keep centres inside 15 km. Results are cached by a hash of the address. | Need care fast accepts a street address when this is on. | City search only. No call to Nominatim. |
| `FEATURE_PRIVATE_MEDIA` | off | Daily-log and learning-story photos are returned as a short-lived R2 link. Public URLs are dropped. | The feed shows the signed photo or nothing. | Saved photo values stay as they are today. |
| `FEATURE_QR_KIOSK` | off | Mint and redeem a rotating check-in code. Writes attendance only after a valid scan for an enrolled child. | Daycare daily desk shows the code. Parent daily feed can scan it. | The screen stays hidden. |
| `FEATURE_PROVINCE_REPORTS` | off | Build a CSV or PDF from saved listings. Manitoba and Ontario columns differ. | Admin registries page offers a download when this is on. | The download stays hidden. |
| `FEATURE_GOV_SCOPES` | off | Totals for the province stored on the government account. Other provinces are not queried. | Account page shows the totals. The phone app points to the website and does not sign the person out. | The card says totals are not on yet. The person stays signed in. |
| `FEATURE_FR_CA` | off | French subjects on parent request email and SMS when the saved locale is French. Quebec and New Brunswick location, plus the browser or device language, choose French when nobody saved a choice. | Language toggle shows Français (Canada). Admin, government, parent, and daycare gap strings use fr-CA. | Today's rules: Quebec only, browser language ignored, email and SMS subjects stay English. |

## Why PostHog

PostHog is already wired (`posthog-js`, `VITE_PUBLIC_POSTHOG_KEY` / `POSTHOG_HOST` on Vercel **kidease-git**, legal copy, `isPostHogFlagEnabled` on the client). A thin `POST /flags?v=2` call on the server needs **no extra SDK** and **no personal API key**.

Vercel Flags, Flagsmith, and LaunchDarkly would add another vendor and another secret. Skip them unless we drop PostHog.

Do **not** use these flags for auth or Turnstile. Those stay their own env-gated helpers.

`SUBSCRIPTIONS_ENABLED` is the one switch for whether paid plans are offered. It does not hold a Stripe secret. Turning it on does not invent a price. Checkout still needs `stripeChargesLive()` and the matching `STRIPE_PRICE_*` id. Leave it unset (or `0`) on Production during the free founding period. Set `1` when Kyle wants paid extras. PostHog key `SUBSCRIPTIONS_ENABLED` flips it without a redeploy once `POSTHOG_FLAGS_KEY` is set.

## How Kyle flips a flag (no redeploy)

1. Confirm credentials for that channel exist (Twilio / FCM / APNs). Flags do not invent keys. SMS also needs CASL consent + STOP — see `docs/sms.md`.
2. On Vercel **kidease-git** (Production + Preview), set `POSTHOG_FLAGS_KEY` to the **same public project key** already used as `VITE_PUBLIC_POSTHOG_KEY` (`phc_…`). Optional: `POSTHOG_FLAGS_HOST` if ingest is not `https://us.i.posthog.com`. Redeploy **once** so the server can call PostHog. Leave the key unset to stay env-only.
3. In [PostHog](https://us.posthog.com) → KidEase → **Feature flags** → **New feature flag**.
   - Key must match the env name exactly: `FEATURE_SMS`, `FEATURE_PUSH`, `FEATURE_VIDEO`, `FEATURE_INAPP_CHAT`, `FEATURE_PROVIDER_SUBSCRIPTIONS`, `SHOW_PAY_CTAS`, `SUBSCRIPTIONS_ENABLED`, `FOUNDING_BADGE_ENABLED`, `FEATURE_OPEN_SPOT_ALERTS`, `FEATURE_SPOT_OFFER_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_SMS`, `FEATURE_QC_HOME_DAYCARES`, `FEATURE_AREA_WAITLIST_ALERTS`, `FEATURE_INSPECTION_HISTORY`, `FEATURE_PROVINCIAL_VACANCY_INDEX`, or `FEATURE_REVIEW_REPORTS`.
   - Key must match the env name exactly: `FEATURE_SMS`, `FEATURE_PUSH`, `FEATURE_VIDEO`, `FEATURE_INAPP_CHAT`, `FEATURE_PROVIDER_SUBSCRIPTIONS`, `SHOW_PAY_CTAS`, `SUBSCRIPTIONS_ENABLED`, `FOUNDING_BADGE_ENABLED`, `FEATURE_OPEN_SPOT_ALERTS`, `FEATURE_SPOT_OFFER_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_SMS`, `FEATURE_QC_HOME_DAYCARES`, or `FEATURE_AREA_WAITLIST_ALERTS`, or `FEATURE_TOUR_PIPELINE`.
   - Key must match the env name exactly: `FEATURE_SMS`, `FEATURE_PUSH`, `FEATURE_VIDEO`, `FEATURE_INAPP_CHAT`, `FEATURE_PROVIDER_SUBSCRIPTIONS`, `SHOW_PAY_CTAS`, `SUBSCRIPTIONS_ENABLED`, `FOUNDING_BADGE_ENABLED`, `FEATURE_OPEN_SPOT_ALERTS`, `FEATURE_SPOT_OFFER_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_SMS`, `FEATURE_QC_HOME_DAYCARES`, or `FEATURE_AREA_WAITLIST_ALERTS`, or `FEATURE_NEED_CARE_FAST`.
   - Key must match the env name exactly: `FEATURE_SMS`, `FEATURE_PUSH`, `FEATURE_VIDEO`, `FEATURE_INAPP_CHAT`, `FEATURE_PROVIDER_SUBSCRIPTIONS`, `SHOW_PAY_CTAS`, `SUBSCRIPTIONS_ENABLED`, `FOUNDING_BADGE_ENABLED`, `FEATURE_OPEN_SPOT_ALERTS`, `FEATURE_SPOT_OFFER_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_SMS`, `FEATURE_QC_HOME_DAYCARES`, or `FEATURE_AREA_WAITLIST_ALERTS`, or `FEATURE_INCLUSIVE_FILTERS`.
   - Key must match the env name exactly: `FEATURE_SMS`, `FEATURE_PUSH`, `FEATURE_VIDEO`, `FEATURE_INAPP_CHAT`, `FEATURE_PROVIDER_SUBSCRIPTIONS`, `SHOW_PAY_CTAS`, `SUBSCRIPTIONS_ENABLED`, `FOUNDING_BADGE_ENABLED`, `FEATURE_OPEN_SPOT_ALERTS`, `FEATURE_SPOT_OFFER_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_SMS`, `FEATURE_QC_HOME_DAYCARES`, or `FEATURE_AREA_WAITLIST_ALERTS`, or `FEATURE_ECE_JOBS`.
   - Key must match the env name exactly: `FEATURE_SMS`, `FEATURE_PUSH`, `FEATURE_VIDEO`, `FEATURE_INAPP_CHAT`, `FEATURE_PROVIDER_SUBSCRIPTIONS`, `SHOW_PAY_CTAS`, `SUBSCRIPTIONS_ENABLED`, `FOUNDING_BADGE_ENABLED`, `FEATURE_OPEN_SPOT_ALERTS`, `FEATURE_SPOT_OFFER_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_SMS`, `FEATURE_QC_HOME_DAYCARES`, or `FEATURE_AREA_WAITLIST_ALERTS`, or `FEATURE_DIGITAL_ATTENDANCE`.
   - Key must match the env name exactly: `FEATURE_SMS`, `FEATURE_PUSH`, `FEATURE_VIDEO`, `FEATURE_INAPP_CHAT`, `FEATURE_PROVIDER_SUBSCRIPTIONS`, `SHOW_PAY_CTAS`, `SUBSCRIPTIONS_ENABLED`, `FOUNDING_BADGE_ENABLED`, `FEATURE_OPEN_SPOT_ALERTS`, `FEATURE_SPOT_OFFER_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_SMS`, `FEATURE_QC_HOME_DAYCARES`, `FEATURE_AREA_WAITLIST_ALERTS`, or `FEATURE_STAFF_SCHEDULING`.
   - Key must match the env name exactly: `FEATURE_SMS`, `FEATURE_PUSH`, `FEATURE_VIDEO`, `FEATURE_INAPP_CHAT`, `FEATURE_PROVIDER_SUBSCRIPTIONS`, `SHOW_PAY_CTAS`, `SUBSCRIPTIONS_ENABLED`, `FOUNDING_BADGE_ENABLED`, `FEATURE_OPEN_SPOT_ALERTS`, `FEATURE_SPOT_OFFER_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_SMS`, `FEATURE_QC_HOME_DAYCARES`, `FEATURE_AREA_WAITLIST_ALERTS`, or `FEATURE_LEARNING_PORTFOLIOS`.
   - Key must match the env name exactly: `FEATURE_SMS`, `FEATURE_PUSH`, `FEATURE_VIDEO`, `FEATURE_INAPP_CHAT`, `FEATURE_PROVIDER_SUBSCRIPTIONS`, `SHOW_PAY_CTAS`, `SUBSCRIPTIONS_ENABLED`, `FOUNDING_BADGE_ENABLED`, `FEATURE_OPEN_SPOT_ALERTS`, `FEATURE_SPOT_OFFER_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_SMS`, `FEATURE_QC_HOME_DAYCARES`, `FEATURE_AREA_WAITLIST_ALERTS`, or `FEATURE_ORG_DASHBOARD`.
   - Key must match the env name exactly: `FEATURE_SMS`, `FEATURE_PUSH`, `FEATURE_VIDEO`, `FEATURE_INAPP_CHAT`, `FEATURE_PROVIDER_SUBSCRIPTIONS`, `SHOW_PAY_CTAS`, `SUBSCRIPTIONS_ENABLED`, `FOUNDING_BADGE_ENABLED`, `FEATURE_OPEN_SPOT_ALERTS`, `FEATURE_SPOT_OFFER_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_MAIL`, `FEATURE_OPEN_SPOTS_CHECKIN_SMS`, `FEATURE_QC_HOME_DAYCARES`, or `FEATURE_AREA_WAITLIST_ALERTS`, or `FEATURE_PRIVATE_PHOTO_FEED`.
   - Create the flag **disabled**. Boolean release toggle (not a % experiment). The server evaluates as distinct id `kidease-server`.
4. Enable or disable the flag in PostHog. Within ~30s the app picks it up (in-memory TTL). No Vercel redeploy.
5. Confirm Admin → Chat lab (`/admin-chat`): source reads **PostHog**, value on/off. Secret values are never shown.

To go back to env-only: disable or delete the PostHog flag (missing key → env), or unset `POSTHOG_FLAGS_KEY` and redeploy.

Env still works as a fallback when PostHog is down (last successful overlay is kept; if none, env). You can also set `FEATURE_*=1` or `0` on Vercel the old way — that needs a redeploy.

## Vercel env

| Name | Required | Notes |
| --- | --- | --- |
| `FEATURE_SMS` | no | Default **off**. Leave `0` until Twilio + CASL are ready. |
| `FEATURE_PUSH` | no | Default **off**. Production stays disarmed until FCM, APNs, or the VAPID pair exists, and you set the flag. |
| `FEATURE_VIDEO` | no | Default **off**. Leave `0` until Twilio Video credentials exist. |
| `FEATURE_INAPP_CHAT` | no | Default **off**. Chat lab only. The parent helper bubble is a separate PostHog flag. Do not flip this to enable parent ↔ centre `/inbox` — that path is already live. |
| `FEATURE_PROVIDER_SUBSCRIPTIONS` | no | Default **on** when unset. |
| `SHOW_PAY_CTAS` | no | Default **off**. Leave `0` on Production. Set `1` to restore Upgrade / Subscribe chrome after `SUBSCRIPTIONS_ENABLED=1`. Does not flip SMS / Push / Video. |
| `SUBSCRIPTIONS_ENABLED` | no | Default **off**. Leave unset during the free founding period. Set `1` to restore paid plans and checkout. Does not set a price. |
| `FOUNDING_BADGE_ENABLED` | no | Default **on**. Set `0` to hide the Founding member badge. The database marker stays. |
| `FEATURE_OPEN_SPOT_ALERTS` | no | Default **off**. Leave `0` until Kyle wants email when a saved search matches a newly posted open spot. |
| `FEATURE_SPOT_OFFER_MAIL` | no | Default **off**. Leave `0` until you want offer emails. The waitlist still works. |
| `FEATURE_OPEN_SPOTS_CHECKIN_MAIL` | no | Default **off**. Leave `0` until you want the weekly open-spots email. |
| `FEATURE_OPEN_SPOTS_CHECKIN_SMS` | no | Default **off**. Leave `0` until you want the weekly text. The toll-free sender is approved. Also needs `FEATURE_SMS` and consent. |
| `FEATURE_QC_HOME_DAYCARES` | no | Default **off**. Leave `0` until Kyle publishes Quebec recognized home daycares. No email or SMS to those providers. |
| `FEATURE_AREA_WAITLIST_ALERTS` | no | Default **off**. Kyle approved the wording. Set `1` to send the area email. Joining a waitlist and the in-app bell still work. |
| `FEATURE_INSPECTION_HISTORY` | no | Default **off**. Set `1` to show cached public inspection rows. Does not turn on subscriptions. |
| `FEATURE_PROVINCIAL_VACANCY_INDEX` | no | Default **off**. Set `1` to show a page per province, confirm history, and freshness bands. The national index stays either way. |
| `FEATURE_CURRICULUM_PACK` | no | Default **off**. Province learning pack. Does not turn on subscriptions, SMS, or push. |
| `FEATURE_CURRICULUM_PACK_LIVE` | no | Default **off**. Parents see published stories only when this is also on. |
| `FEATURE_STORY_CORNER` | no | Default **off**. Local Global Digital Library books. StoryWeaver stays off until a token exists, and this build does not call it. Unite for Literacy is a link out. |
| `FEATURE_REVIEW_REPORTS` | no | Default **off**. Set `1` to let a signed-in person report a published review and to show a rating from the first review. |
| `FEATURE_TOUR_PIPELINE` | no | Default **off**. Set `1` for no-show, moved reminders, and a calendar file in the tour email. |
| `FEATURE_NEED_CARE_FAST` | no | Default **off**. Set `1` to sort Need care fast by open spots, then distance. |
| `FEATURE_INCLUSIVE_FILTERS` | no | Default **off**. Set `1` to let a centre publish diet and extra-support details. |
| `FEATURE_ECE_JOBS` | no | Default **off**. Set `1` to let a centre post a role and read applicants. No charge. |
| `FEATURE_DIGITAL_ATTENDANCE` | no | Default **off**. Set `1` to replace the check-in camera with arrival and pickup. No photo of a child. |
| `FEATURE_STAFF_SCHEDULING` | no | Default **off**. Set `1` to open staff shifts. Does not turn on subscriptions or SMS. |
| `FEATURE_LEARNING_PORTFOLIOS` | no | Default **off**. Set `1` to open private learning stories. No photos. |
| `FEATURE_ORG_DASHBOARD` | no | Default **off**. Set `1` to open the centres dashboard. Does not turn on subscriptions. |
| `FEATURE_PRIVATE_PHOTO_FEED` | no | Default **off**. Set `1` so classroom photos need enrolment and consent, and stay off public pages. |
| `FEATURE_PRODUCT_EVENTS` | no | Default **off**. Server events. Also set `VITE_FEATURE_PRODUCT_EVENTS=1` for browser events. Uses the existing public PostHog key. No personal details in properties. |
| `FEATURE_NCF_STREET` | no | Default **off**. Set `1` to geocode street addresses with OpenStreetMap Nominatim. No Google key. |
| `FEATURE_PRIVATE_MEDIA` | no | Default **off**. Set `1` to require private R2 keys for daily-log and learning-story photos. Needs the existing R2 keys. No public bucket URL is returned. |
| `FEATURE_QR_KIOSK` | no | Default **off**. Set `1` to show the rotating check-in code. Also set `KIOSK_TOKEN_SECRET` (a random string, not a vendor key). |
| `KIOSK_TOKEN_SECRET` | no | Server-only signing key for check-in codes. Leave blank to keep minting off. Never commit a real value. |
| `FEATURE_PROVINCE_REPORTS` | no | Default **off**. Set `1` to let admin download a provincial licensing CSV or PDF. |
| `FEATURE_GOV_SCOPES` | no | Default **off**. Set `1` after a profile has role `government` and `gov_province`. Does not sign anyone out. |
| `FEATURE_FR_CA` | no | Default **off**. Set `1` for fr-CA auto-detect (browser, device, Quebec, New Brunswick) and French email and SMS. A saved language choice still wins. |
| `FEATURE_WITHDRAWAL` | no | Default **off**. Uses the centre's notice period and stored fee. A freed space queues the area waitlist. |
| `FEATURE_ENROLMENT_HANDOFF` | no | Default **off**. Accepted spot, enrolment packet, e-sign, then the first bill. Needs _LIVE to call DocuSign or save the bill. |
| `FEATURE_CHILD_PROFILE` | no | Default **off**. Parents edit allergies, medical notes, pickups, and emergency contacts. The daycare sees them after enrolment. |
| `FEATURE_NOTIFICATION_CENTRE` | no | Default **off**. In-app inbox with read receipts. Texts go only to CASL opted-in people. Push stays behind FEATURE_PUSH. |
| `FEATURE_CLAIM_NOTICES` | no | Default **off**. Claim approve or decline notices go to the daycare and that province. Texts still need CASL. |
| `FEATURE_COMPLAINT_UPDATES` | no | Default **off**. Province updates go to the parent. Uses gov complaints when that table exists, otherwise safety reports. |
| `FEATURE_SUBSIDY_STATUS` | no | Default **off**. Tracks submitted, in review, approved, or declined. KidEase does not decide the subsidy. |
| `FEATURE_INSPECTION_SYNC` | no | Default **off**. Public inspection summary with the source and date. KidEase does not invent an outcome. |
| `FEATURE_ESCALATIONS` | no | Default **off**. Unresolved items go to admin after a saved number of hours. Involved roles can see the status. |
| `FEATURE_CHANGE_REQUESTS` | no | Default **off**. Capacity, hours, address, and director wait for the province. The public listing updates after approval. |
| `FEATURE_ABSENCE_REPORTS` | no | Default **off**. A parent absence updates attendance and the room ratio in the same request and notifies the daycare. |
| `FEATURE_DSR_PROPAGATION` | no | Default **off**. Export or deletion requests reach every affected role. A retention hold blocks deletion. Sign-in stays open. |
| `POSTHOG_FLAGS_KEY` | no | Server-only. Same `phc_…` project key as analytics. Leave blank to disable remote. Never commit a real value. |
| `POSTHOG_FLAGS_HOST` | no | Defaults to `POSTHOG_HOST` or `https://us.i.posthog.com`. |

The app **boots with no remote keys**. Do not invent a personal API key or a second PostHog project.

## What is wired

- `evaluateFeatureFlag` / `smsEnabled` / `pushEnabled` / `videoEnabled` / `inAppChatEnabled` / `providerSubscriptionsEnabled` / `showPayCtas` / `subscriptionsEnabled` / `foundingBadgeEnabled` / `openSpotAlertsEnabled` / `areaWaitlistAlertsEnabled` / `provincialVacancyIndexEnabled` / `reviewReportsEnabled` / `tourPipelineEnabled` / `needCareFastEnabled` / `inclusiveFiltersEnabled` / `eceJobsEnabled` / `digitalAttendanceEnabled` / `privatePhotoFeedEnabled`.
- Safe enablement: `describeChannelReadiness` / `smsArmed` / `pushArmed` / `videoSurfaceEnabled` in `src/lib/channel-readiness.ts`.
- Send / register / mint paths in `src/lib/server/sms.ts`, `push-send.ts`, `push-tokens.ts`, `video.ts`.
- Admin → Chat lab (`/admin-chat`) shows on/off, source (env / PostHog / default), Production-blocked / Preview-override / SDK-not-attached, plus a disabled composer and the flag-name catalog. See `docs/chat.md`.
- Client `isPostHogFlagEnabled` is analytics-only. Server flags are the source of truth for SMS / push / video send gates.
- Web session replay uses a separate client flag, `session-replay-web` (kill switch). See `docs/posthog.md`.

## Later (not this PR)

- Per-user or % rollouts (today the server uses one distinct id).
- A dedicated `/admin-flags` page. Chat lab is enough to read state.
