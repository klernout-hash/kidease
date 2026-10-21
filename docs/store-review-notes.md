# App Review notes (paste into App Store Connect and Play Console)

Support: support@kidease.ca

KidEase is for adults. Parents and daycare providers. Accounts confirm they are 18 or older. Do not place it in the Kids category or the Google Play Families program.

Nothing is sold in the app. There is no Apple In-App Purchase and no Google Play Billing in this version. A daycare plan already bought on https://www.kidease.ca still unlocks after sign-in. The app does not link out to a subscribe or pay page.

## What works in this version (Apple guideline 4.2)

The iPhone and Android apps are a Capacitor shell around https://www.kidease.ca. The bottom bar (Search, Saved, Messages, Account) is the website navigation inside the app. It is not a separate iOS tab bar.

- Search licensed daycares, including a map. Location is used only while searching.
- Share a listing with the system share sheet.
- Saved centres stay on the phone when the network is off.
- Sign in with Apple on iPhone, when the Apple keys are set.

Push notifications are not in this version. The app does not ask for notification permission.

- Voice and video calls use the camera and microphone only while the call screen is open. Twilio’s scripts load on those pages. The app does not record the call. A video tour that needs Parent Plus stays closed here, with no price and no subscribe button. There is no background-audio mode and no VoIP mode. Calls run while the app is on screen.

## Reviewer sign-in

App Review signs in on the live site, https://www.kidease.ca. The two accounts have to exist in the production database before you submit.

Do not put passwords in this file or in git. Do not print them. Do not commit `DATABASE_URL`.

Kyle runs this once, from a machine that already has the production database URL in the environment:

1. Export `REVIEWER_PARENT_PASSWORD` and `REVIEWER_DAYCARE_PASSWORD`. Optional email overrides: `REVIEWER_PARENT_EMAIL` and `REVIEWER_DAYCARE_EMAIL`.
2. Run `npm run ops:reviewer-demo`.
3. Confirm the centre `qa-reviewer-demo-centre` stays `admin_only` with `is_test = 1`, and that public search does not list it.
4. Sign in on https://www.kidease.ca with each account. Open Search, Saved, Messages, and Account.

Defaults if the email vars are unset: `reviewer.parent@kidease.ca` and `reviewer.daycare@kidease.ca`. Both profiles are marked test accounts.

This document does not run that command.

## How to delete an account

Account → Delete account. Type DELETE. The account can be restored for 30 days. Sign in with Apple tokens are revoked when deletion is confirmed, when Apple keys are set. Billing rows the tax rules require are kept.

## If location search is empty

Reviewers outside Canada can search **Winnipeg, Manitoba**. The directory is Canadian provinces and territories.

## Still needed before the binary is uploaded

- Apple Team ID (not enrolment id B7UM5AC9JQ), Services ID, Sign in with Apple `.p8`, and the four `APPLE_*` env vars. See `docs/apple-sign-in.md`.
- Push is not part of this version. Do not add an APNs key for this upload. `aps-environment` is not in the entitlements.
- Play App Signing SHA-256 in `ANDROID_CERT_SHA256S`.
- Numeric App Store id in `VITE_APPLE_APP_STORE_ID` after App Store Connect assigns it.
- Archive the iOS app with Xcode 26 and the iOS 26 SDK.
