# Store sign-in

Each KidEase build shows only the sign-in buttons that work on that device.

| Where | Buttons, in this order |
| --- | --- |
| iPhone and iPad app | Apple, Google, Facebook, email |
| Google Play and Samsung Galaxy Store | Google, Facebook, email |
| Huawei AppGallery | Huawei ID, Facebook, email |
| Amazon Appstore and Fire | Login with Amazon, Facebook, email |
| Microsoft Store and the website | Apple, Google, Facebook, email |

Email is the form under the buttons. The Help button stays on these screens.

Huawei ID and Login with Amazon stay hidden until the flags below are `1` and the keys are set. Apple, Google, and Facebook keep their current flags and keys.

A Play or Galaxy Store build hides Google when the phone has no Google Play services. The app adds `KidEaseNoGms` to the user agent in that case.

## Env vars

Leave the flags at `0` until the consoles below are filled in. Do not commit real values.

- `FEATURE_SIGNIN_HUAWEI`
- `HUAWEI_APP_ID` (same value as `HUAWEI_CLIENT_ID`)
- `HUAWEI_APP_SECRET` (same value as `HUAWEI_CLIENT_SECRET`)
- `FEATURE_SIGNIN_AMAZON`
- `AMAZON_CLIENT_ID`
- `AMAZON_CLIENT_SECRET`
- `AMAZON_API_KEY`
- `VITE_STORE_CHANNEL` optional, blank on www.kidease.ca. `play`, `samsung`, `huawei`, `amazon`, `microsoft`, `ios`, or `web`. The Android flavor user agent wins when both are set.

Android product flavors: `play`, `samsung`, `huawei`, `amazon`.

Redirect URLs, exact, no trailing slash:

- `https://www.kidease.ca/api/auth/callback/huawei`
- `https://kidease.ca/api/auth/callback/huawei`
- `https://kidease-git.vercel.app/api/auth/callback/huawei`
- the same three hosts with `/api/auth/callback/amazon`

A verified email from Huawei ID or Login with Amazon joins an existing KidEase account the same way Apple, Google, and Facebook do. An email the provider marks unverified does not join an account.

## What to copy from each console

Package name for every Android store: `ca.kidease.app`.

Play App Signing SHA-256, already in `assetlinks.json`:

`33:89:F7:45:7E:33:5B:02:97:6F:27:BF:2A:49:DD:73:15:52:6A:9F:48:25:23:02:31:C1:1E:0A:51:27:BD:91`

Play upload key SHA-256:

`E3:02:0E:FD:A0:52:21:22:FD:9D:F9:FE:C7:D8:D7:8D:F9:D0:8E:C3:53:D0:6F:A5:55:21:82:76:AD:64:16:E5`

SHA-1 is not in this repo. Copy SHA-1 and SHA-256 from each store after that store signs the app. Meta wants the SHA-1 as a key hash (base64), not colon hex. Google Cloud wants the SHA-1 on the Android OAuth client.

| Store | Google Cloud Android client | Meta Android key hash | Notes |
| --- | --- | --- | --- |
| Play | App signing and upload SHA-1 | App signing and upload SHA-1 | Play Console → App integrity → App signing |
| Galaxy Store | That build's SHA-1 and SHA-256 | That build's SHA-1 | Seller Office shows the certificate after upload |
| AppGallery | Not used. This build has no Google button | AppGallery signing SHA-1 | Also paste the SHA-256 into AppGallery Connect for the app |
| Amazon | Not used. This build has no Google button | Amazon signing SHA-1 | Security profile API key uses the package plus SHA-256 |

Huawei AppGallery Connect: app id → `HUAWEI_APP_ID`. App secret → `HUAWEI_APP_SECRET`.

Amazon developer console: security profile client id → `AMAZON_CLIENT_ID`. Client secret → `AMAZON_CLIENT_SECRET`. API key for `ca.kidease.app` and the signing certificate → `AMAZON_API_KEY`.
