# KidEase store launch — Canada 1 Nov 2026

Cheap DIY Capacitor path. This repo can get a **debug / local** iOS + Android binary ready. It **cannot** upload to TestFlight or Play until Kyle finishes Apple Developer + Play Console enrollment.

**This checklist does not mean a build was submitted.** App Store / Play listings stay **Coming soon** on `/get-app`.

Live WebView: https://www.kidease.ca  
Bundle / application id: `ca.daycarenearme.app`  
App name: KidEase  
Support: support@kidease.ca

Longer engineering notes: [`mobile-builds.md`](mobile-builds.md). Account + review policy: [`store-readiness.md`](store-readiness.md).

---

## Fixed in-repo (no store account required)

| Item | Status |
| --- | --- |
| Capacitor 8 shell, `ios/` + `android/` checked in | Done |
| Production `server.url` → `https://www.kidease.ca` | Done |
| Icons + splash from the pin pipeline (`npm run cap:assets`) | Done |
| When-in-use location only (no background / Always) | Done |
| AASA + Digital Asset Links served as `application/json` | Done — **placeholder Team ID / empty SHA-256** |
| iOS Associated Domains (`applinks` + `webcredentials` for `www.kidease.ca` and `kidease.ca`) | Done in `App.entitlements` |
| Android App Links (`autoVerify` https hosts) + `KidEase://` / `ca.daycarenearme.app://` | Done in `AndroidManifest.xml` |
| Legal URLs live: `/privacy`, `/terms`, `/help`, `/delete-account` | Done |
| Export compliance flag `ITSAppUsesNonExemptEncryption=false` | Done |
| Android `allowBackup=false` | Done |

---

## Still blocked on Kyle’s Apple / Play accounts

Do **not** invent these values. Leave env vars blank until the consoles show real ones.

| Need | Where it comes from | What to do in the repo / Vercel |
| --- | --- | --- |
| Apple Developer Program (~$99/yr) | developer.apple.com | Enroll as the KidEase entity |
| Apple Team ID (10 chars) | Membership details | Set `APPLE_TEAM_ID` on Vercel Production. Until then AASA keeps `XXXXXXXXXX.ca.daycarenearme.app` |
| App Store Connect app + bundle `ca.daycarenearme.app` | App Store Connect | Xcode Automatic signing after Team is selected |
| Distribution cert + provisioning | Xcode / portal | **Product → Archive → TestFlight**. Not possible from this VM |
| Numeric App Store id | App Store Connect URL (`idNNNN`) | Set `VITE_APPLE_APP_STORE_ID` — never guess |
| Play Console (~$25) | play.google.com/console | Create app package `ca.daycarenearme.app` |
| Upload keystore | Local `keytool` (gitignored) | `android/key.properties` from `android/key.properties.example` |
| Play App Signing SHA-256 | Play → App integrity → App signing | Set `ANDROID_CERT_SHA256S` on Vercel. Until then `sha256_cert_fingerprints` stays `[]` |
| Play internal AAB | `./gradlew bundleRelease` on a signed machine | Upload to Internal testing — not this PR |
| Push (optional for 1 Nov) | Firebase + APNs `.p8` | Keep `FEATURE_PUSH=0`. Run `npx cap sync` when you cut a binary that should include the plugin |
| Video / camera strings | Only if `FEATURE_VIDEO=1` ships | Do not add unused camera / mic purpose strings |

---

## Timeline toward 1 November 2026

Today is mid-September. Work the store accounts in **parallel** with web polish — do not wait for this PR to merge before enrolling.

| When | Owner | Outcome |
| --- | --- | --- |
| Now | Eng (this PR) | Native projects, icons, App Links files, placeholder AASA/assetlinks |
| As soon as Kyle can log in | Kyle | Apple Developer + Play Console enroll. No repo secret required to start |
| Same week as enroll | Kyle + laptop with Xcode / Android Studio | Select Team in Xcode; create upload keystore; first **debug** device smoke ([`mobile-builds.md`](mobile-builds.md)) |
| After first signed identity exists | Kyle | Paste `APPLE_TEAM_ID` and `ANDROID_CERT_SHA256S` on Vercel → redeploy → confirm AASA / assetlinks are 200 JSON with real values |
| Mid-October target | Kyle | TestFlight internal + Play internal testers. Listing copy + screenshots drafted |
| Late October | Kyle | App Privacy / Data safety forms. Submit for review only after smoke passes |
| **1 Nov 2026** | Kyle | Public Canada listing **if** review approved. Soft-launch is OK if review is still in flight — `/get-app` already says Coming soon |

If accounts slip, the website + PWA still launch. Do not slip the web date to wait for store review.

---

## First signed-build commands (Kyle’s machine)

```bash
npm ci
npm run cap:prepare
# iOS: opens Xcode — select Team, then Product → Archive → App Store Connect
npm run cap:ios
# Android: copy android/key.properties.example → android/key.properties, then
cd android && ./gradlew bundleRelease
```

Never commit `.p12`, `.jks`, `key.properties`, `google-services.json`, or `GoogleService-Info.plist`.

---

## Verify deep links after Vercel has real IDs

```bash
curl -sI https://www.kidease.ca/.well-known/apple-app-site-association
curl -sI https://www.kidease.ca/apple-app-site-association
curl -sI https://www.kidease.ca/.well-known/assetlinks.json
```

Expect **HTTP 200** `application/json`, no redirect. `appID` must become `<TeamID>.ca.daycarenearme.app`. `sha256_cert_fingerprints` must be a non-empty array of Play hashes.

Amazon Appstore is out of scope.
