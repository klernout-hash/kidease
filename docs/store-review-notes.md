# App Review notes (paste into App Store Connect and Play Console)

Support: support@kidease.ca

## Purpose and audience

KidEase helps adults in Canada find licensed daycare and talk to the centre. Parents search, save centres, and request a tour. Daycare owners claim their listing and answer those parents. Accounts confirm they are 18 or older. Do not place it in the Kids category or the Google Play Families program.

The iPhone app is a Capacitor shell around https://www.kidease.ca. The same account works on the website and in the app.

## Business model (guidelines 3.1.3(e) and 3.1.5)

Nothing digital is sold in this app. There is no Apple In-App Purchase and no Google Play Billing. There is no subscription, plan, upgrade, trial, or digital unlock for sale in the app. No purchase and no price.

Real-world childcare is the only payment. A daycare sends a parent a bill, an invoice, or a deposit for care at the centre. The parent pays that bill with Stripe. KidEase keeps a 3% service fee on that real-world payment. The centre receives the bill amount. That fee is for facilitating a real-world service, not for digital content.

Nobody buys a KidEase subscription inside the app. A daycare tool already bought on https://www.kidease.ca still unlocks after sign-in. The app does not show a subscribe button and does not link out to a paywall. Search, saved centres, messages, account, and claiming a listing stay available without any purchase.

## What works in this version (guideline 4.2)

The bottom bar (Search, Saved, Messages, Account) is the website navigation inside the app. It is not a separate iOS tab bar.

- Search licensed daycares, including a map. Location is used only while searching.
- Share a listing with the system share sheet.
- A light haptic tap on some buttons.
- Saved centres stay on the phone when the network is off. If the site cannot load, the app shows an English and French offline page with Try again.
- Swipe in from the left edge to go back.
- Pinch in to zoom. The page does not zoom out.
- Sign in with Apple on the sign-in screen, next to Google and Facebook when those buttons are shown. On iPhone, Google and Facebook are hidden unless Sign in with Apple is beside them.
- Account → Delete account is the first row under settings for a parent and for a daycare. Type DELETE. The account can be restored for 30 days.
- In a message thread: Report this conversation, and Block this daycare or Block this family.
- On a review: Report this review.

Push notifications are not in this version. Voice and video calling are not in this version. The app does not ask for notification permission. It does not show a call button or an incoming-call screen. Info.plist has no `UIBackgroundModes` key. The signed entitlements file has no `aps-environment`.

## Reviewer sign-in

App Review signs in on the live site, https://www.kidease.ca. The two accounts have to exist in the production database before you submit. The passwords are in App Store Connect. They are not in this file and not in git.

- Parent: reviewer.parent@kidease.ca
- Daycare: reviewer.daycare@kidease.ca

Both accounts are test accounts. Email is already verified and two-factor is off. No email code is sent. The parent account has complimentary Parent Plus. Nothing is charged. The daycare account does not get Plus.

The fictional centre is `qa-reviewer-demo-centre` (North Elm Family Daycare, Winnipeg, Manitoba). It stays `admin_only` with `is_test = 1`. Public search does not list it. It is not a real licensed daycare. No fee or rating is stored. Hours are Monday to Friday, 7:30 a.m. to 5:30 p.m. Photos are KidEase sample rooms, not pictures of this centre. The parent has two fictional child profiles, a message thread, a tour request, and a waitlist entry.

Open Search, Saved, Messages, and Account with each account. The parent sees the message thread. The daycare sees the same thread, the tour request, and the waitlist. There is no call button. Calling is not in this version.

## External services

This build does not use Apple Push Notification service or Firebase Cloud Messaging.

- Stripe, for real-world childcare bills only
- Email delivery, for account mail such as password reset
- Map tiles, while a parent is searching

## Region

The directory is Canadian provinces and territories. Reviewers outside Canada can search **Winnipeg, Manitoba**. The app is in English and French.

## How to delete an account

Account → Delete account. It is the first settings row. Type DELETE. The account can be restored for 30 days. Sign in with Apple tokens are revoked when deletion is confirmed, when Apple keys are set. Billing rows the tax rules require are kept.

## If the site does not load

The app shows “You’re offline” / “Vous êtes hors ligne” and Try again. Saved centres on the phone are listed there when any were saved before.

## Still needed before the binary is uploaded

Do not uncomment the push lines in `ios/App/App/Store.xcconfig`. Do not add an APNs key for this upload. Archive with Xcode 27.1 or later and the iOS 27.1 SDK. Apps built with the iOS 26 SDK sit letterboxed in the middle of the iPhone Duo inner display and beside the status bar on its cover display. Run the iPhone Duo simulator pass (T1 in `docs/mobile-builds.md`) before archiving. This file does not upload the binary.
