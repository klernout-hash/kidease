# Passkeys

Parents, daycare centres, and admins can sign in with Face ID, an Android face or fingerprint, or Windows Hello. Email and password stay the fallback, including the email code on staff desks when a passkey did not verify the person.

## Relying party

- RP ID: `kidease.ca`
- Web origins: `https://www.kidease.ca` and `https://kidease.ca`
- Android origins: `android:apk-key-hash:` plus the base64url SHA-256 of each cert in `assetlinks.json` (Play App Signing and the upload key, or `ANDROID_CERT_SHA256S` when that env is set)
- Localhost origins are accepted only when `VERCEL_ENV` is not `production`

Library: `@simplewebauthn/server` and `@simplewebauthn/browser`. Better Auth 1.7 has no passkey plugin, so KidEase mints the session with the same cookie helper as email sign-in.

## Admin email step

A successful passkey requires user verification. When the authenticator reports that the person was verified, KidEase sets the same staff 2FA cookie the email code sets, so the email code is skipped. If verification is missing, sign-in can still open a session, and staff desks still ask for the email code.

Cloudflare Access on `/admin` is unchanged.

## Android app

The Capacitor app loads `https://www.kidease.ca`. `MainActivity` turns on WebView WebAuthn for the app (`WebSettingsCompat.WEB_AUTHENTICATION_SUPPORT_FOR_APP`, androidx.webkit 1.12+) so the origin is the `android:apk-key-hash` from Digital Asset Links.

Many WebViews on minSdk 24 still have no `PublicKeyCredential`. `PasskeyPlugin` uses Android Credential Manager in that case. Play and Samsung also ship `credentials-play-services-auth`. The Huawei flavour does not: AppGallery phones use the platform Credential Manager on Android 14 and newer. Older Huawei phones keep email sign-in.

## iOS app (not done yet)

`apple-app-site-association` already lists `webcredentials.apps` as `XXXXXXXXXX.ca.kidease.app`. The iOS project already has Associated Domains for `webcredentials:www.kidease.ca` and `webcredentials:kidease.ca`.

Passkeys inside the iOS app need the real 10-character Apple Team ID in that file (`APPLE_TEAM_ID` or `APNS_TEAM_ID` on Vercel). Do not invent one. Until then, Face ID works on the website in Safari, and the iOS app keeps email and password.

## Account

After an email sign-in, KidEase asks once to turn this on. Account → Login and security lists saved devices and can remove one. View-as cannot add or remove a passkey.
