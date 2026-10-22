# Sign in with Apple

The code is ready before the Apple Developer account is approved. The Apple button stays hidden until all four `APPLE_*` values are set and `FEATURE_APPLE_LOGIN=1`. Do not put a `.p8` or a Team ID in git.

Enrolment id `B7UM5AC9JQ` is **not** the Team ID. After Apple approves the enrolment, Membership shows a 10-character Team ID. That value is `APPLE_TEAM_ID`.

## What to create in Apple Developer

1. **App ID** `ca.kidease.app`
   - Capability: **Sign in with Apple**
   - Push is not in this version. Do not enable Push Notifications for the v1 upload.
2. **Services ID** (example: `ca.kidease.web`)
   - Enable **Sign in with Apple**
   - Primary app: the App ID `ca.kidease.app`
   - Domains: `www.kidease.ca` and `kidease.ca`
   - Return URL: `https://www.kidease.ca/api/auth/callback/apple`
3. **Key** with **Sign in with Apple** enabled
   - Download the `.p8` once. Apple will not show it again.
   - Note the 10-character **Key ID**

The native iOS sheet uses the App ID (`ca.kidease.app`). The website redirect uses the Services ID. Better Auth’s `clientId` is the Services ID. `appBundleIdentifier` is the App ID so the native identity token verifies.

## Env vars

Set these on Vercel Production (and any host that serves `/api/auth`). Never commit them.

| Apple Developer value | Env var |
| --- | --- |
| Services ID (example `ca.kidease.web`) | `APPLE_CLIENT_ID` |
| 10-character Team ID from Membership (not `B7UM5AC9JQ`) | `APPLE_TEAM_ID` |
| 10-character Key ID of the Sign in with Apple `.p8` | `APPLE_KEY_ID` |
| Full PKCS8 `.p8` text. Newlines may be written as `\n` | `APPLE_PRIVATE_KEY` |
| App ID. Optional. Defaults to `ca.kidease.app` | `APPLE_BUNDLE_ID` |
| Switch. Set to `1` only after the four keys and the Apple settings below exist. Default `0`. | `FEATURE_APPLE_LOGIN` |

The same `APPLE_TEAM_ID` fills the Apple App Site Association (`docs/STORE-LAUNCH.md`). Leave it blank until Membership shows the real Team ID. The placeholder in git stays `XXXXXXXXXX`.

`VITE_APPLE_APP_STORE_ID` is a different value: the numeric App Store Connect id. Leave it blank until Apple assigns one.

## What the app does

- **Website:** Better Auth social provider `apple`. Redirect return URL `https://www.kidease.ca/api/auth/callback/apple`. Client secret is an ES256 JWT (180 days) built from the `.p8` at process start.
- **iPhone app:** `AppleSignInPlugin.swift` presents the system sheet. The hashed nonce goes to Apple. The raw nonce goes to `signIn.social` with the identity token. The authorization code is exchanged for a refresh token (`grant_type=authorization_code`, no `redirect_uri`) and stored on the Apple account row. `client_id` and the client-secret `sub` for that exchange are the bundle id `ca.kidease.app`, not the Services ID. Android and the website keep the web redirect.
- **Entitlement:** `ios/App/App/App.entitlements` includes `com.apple.developer.applesignin` = `Default`. Push is not in v1, so `aps-environment` is not set.
- **Account deletion:** `revokeStoredAppleSignIn` POSTs to `https://appleid.apple.com/auth/revoke` before the account is closed. Native tokens use `client_id` `ca.kidease.app`. Web tokens use the Services ID. If Apple is not configured, or revoke fails, deletion still finishes. Failures log the HTTP status and Apple's error code. Tokens are not logged. Revoke still runs when the four keys are set, even if `FEATURE_APPLE_LOGIN` is off.
- **Button:** `getSignInProviders` lists Apple only when `FEATURE_APPLE_LOGIN` is on and `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY` are all set. The button uses the same size and weight as Continue with Google and Continue with Facebook.

## Xcode

Archive with **Xcode 26** and the **iOS 26 SDK** when you submit. This Linux checkout cannot archive. Deployment target stays iOS 15.0. `LastUpgradeCheck` in the project file is left as Xcode last wrote it. Do not invent an upgrade check number.
