# Notes for the AppGallery reviewer

Paste this into the reviewer notes box in AppGallery Connect. Add the password there only. Do not put the password in git, in this file, or in a pull request.

Support: support@kidease.ca
Privacy: https://www.kidease.ca/privacy

KidEase is for adults in Canada. Parents and daycare owners. Accounts are 18 or older. It is not a kids app. KidEase is a private company (10037493 MANITOBA LTD.). It is not a government service and no ministry endorses it.

Nothing is sold in this app. There is no Huawei In-App Purchase. Parents are not charged. Daycares use the tools during the free founding period. No card is charged. Continue with Google is not in this build. Huawei ID sign-in is off. The app does not use Google Play services.

Message alerts and the incoming-call ring are not sent in this version.

## Test accounts

The app loads https://www.kidease.ca. Sign in with email.

The accounts Kyle seeds with `npm run ops:reviewer-demo` are:

- Parent: reviewer-parent@kidease.ca
- Daycare: reviewer-provider@kidease.ca

The password is the `REVIEWER_ACCOUNT_PASSWORD` value on the machine that seeded them. It is not in this repo. How to seed them is in `docs/store-review-notes.md`. That page also names `reviewer.parent@kidease.ca` and `reviewer.daycare@kidease.ca` when those email variables are set. Use the two addresses that exist in production. Paste the password only into AppGallery Connect.

The demo centre is North Elm Family Daycare in Winnipeg (`qa-reviewer-demo-centre`). It is a test listing. Public search does not show it. It is not a real licensed daycare. It has no fee and no rating. The parent account has complimentary Parent Plus so a video tour can be opened. Nothing is charged.

## What to try

1. Open the app. Search Winnipeg, Manitoba.
2. Open a listing. Sign in as the parent. Open Saved, Messages, and Account.
3. Sign in as the daycare and open the same message thread.
4. Confirm there is no Continue with Google button and no price or subscribe button.

Distribution for this release is Canada only.
