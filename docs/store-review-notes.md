# App Review notes (paste into App Store Connect and Play Console)

KidEase is for adults. Parents and daycare providers. Accounts confirm they are 18 or older. Do not place it in the Kids category or the Google Play Families program.

Nothing is sold in the app. There is no Apple In-App Purchase and no Google Play Billing in this version. A daycare plan already bought on https://www.kidease.ca still unlocks after sign-in. The app does not link out to a subscribe or pay page.

## Native features (Apple guideline 4.2)

- Tab bar: Search, Saved, Messages, Account
- Map and location search for licensed daycares. Location is used only while searching.
- Share sheet for a listing
- Saved centres available offline
- Push notifications for message and spot replies. Off until the person turns them on. Not asked on first launch.

## Reviewer sign-in

Do not put passwords in this file or in git.

Kyle creates the two accounts with `npm run ops:reviewer-demo` against a non-production database. Passwords live only in `REVIEWER_PARENT_PASSWORD` and `REVIEWER_DAYCARE_PASSWORD`. Optional email overrides: `REVIEWER_PARENT_EMAIL` and `REVIEWER_DAYCARE_EMAIL`. Defaults if unset: `reviewer.parent@kidease.ca` and `reviewer.daycare@kidease.ca`. The demo centre slug `qa-reviewer-demo-centre` is hidden from public search. Both profiles are marked test accounts.

## How to delete an account

Account → Delete account. Type DELETE. The account can be restored for 30 days. Sign in with Apple tokens are revoked when deletion is confirmed, when Apple keys are set. Billing rows the tax rules require are kept.

## If location search is empty

Reviewers outside Canada can search **Winnipeg, Manitoba**. The directory is Canadian provinces and territories.

## Still needed before the binary is uploaded

- Apple Team ID (not enrolment id B7UM5AC9JQ), Services ID, Sign in with Apple `.p8`, and the four `APPLE_*` env vars. See `docs/apple-sign-in.md`.
- APNs key and `google-services.json` if push should work in that build. See `docs/push.md`.
- Play App Signing SHA-256 in `ANDROID_CERT_SHA256S`.
- Numeric App Store id in `VITE_APPLE_APP_STORE_ID` after App Store Connect assigns it.
- Archive the iOS app with Xcode 26 and the iOS 26 SDK.
