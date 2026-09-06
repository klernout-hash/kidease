# KidEase — App Store & Google Play readiness checklist

Bundle ID: `ca.daycarenearme.app`  
App name: KidEase  
Live web: https://www.kidease.ca  
Support: support@kidease.ca  
Positioning: Parent daycare discovery / proximity (not a kids’ social app)

Goal: soft launch via **TestFlight** + **Play internal testing**, then public listing.

---

## 0) Current status (2026-09-05)

- [x] Capacitor shell configured (`ca.daycarenearme.app`)
- [x] Icons / splash pipeline (pin fill pass)
- [x] Geolocation while-using only (good for review)
- [x] Get-app page shows App Store / Play as Coming soon
- [ ] Apple Developer Program enrolled
- [ ] Google Play Console opened
- [ ] Native ios/android projects signed and archived
- [ ] TestFlight build uploaded
- [ ] Play internal AAB uploaded
- [ ] Public store listings live
- [x] Well-known AASA + Digital Asset Links served (placeholder Team ID / empty Play SHA-256 until enroll)

---

## 1) Accounts and legal (Kyle)

### Apple
- [ ] Enroll Apple Developer Program (~$99/yr) as the KidEase entity
- [ ] App Store Connect access for bundle `ca.daycarenearme.app`
- [ ] Agreements / banking / tax paid if asking for paid apps (KidEase can stay free + Stripe web)

### Google
- [ ] Play Console (~$25 one-time)
- [ ] Create app KidEase, package `ca.daycarenearme.app`
- [ ] Complete Play Console identity / org verification if prompted

### Policy URLs (must be live HTTPS)
- [ ] Privacy Policy URL
- [ ] Terms of Use URL
- [ ] Support URL or mailto `support@kidease.ca`
- [ ] Delete-account path documented (Apple requires account deletion if accounts exist)

---

## 2) Product / review compliance

### Positioning
- [ ] Store copy: “for parents / guardians finding licensed daycare” — not “for children”
- [ ] Age rating: typically 4+ / Everyone if no UGC chat; revisit if in-app messaging ships
- [ ] Kids category: **avoid** unless COPPA/kids policies are intentional

### Permissions (strings must match real use)
- [ ] iOS `NSLocationWhenInUseUsageDescription` — precise location while using to find nearby daycares
- [ ] No background location
- [ ] Camera / mic / contacts / tracking: **off** unless feature needs them
- [ ] ATT / tracking: only if ads ID used (prefer none for v1)

### Payments
- [ ] Decide: Stripe Checkout / web subscriptions (current path) vs native IAP
- [ ] If using Stripe web only: do **not** imply App Store subscriptions; Prefer Parent Plus / provider plans via Safari or in-app browser if required by guideline interpretation
- [ ] No broken Pay buttons that 404

### Broken UX that can fail review
- [ ] Fix listing “On the map” embed (or remove embed, keep Directions link)
- [ ] Fix `/faq` mis-route
- [ ] Login / search / listing / help work on a phone WebView
- [ ] No “Coming soon” primary CTAs that look broken inside the binary

### Data / kids
- [ ] Do not collect children’s personal data in v1
- [ ] Parent account email only; clear privacy copy

---

## 3) Engineering (agents / builds)

### Capacitor
- [ ] `ios/` and `android/` projects generated and `npx cap sync`
- [ ] Production server URL points at `https://www.kidease.ca` (or approved CAP_SERVER_URL)
- [ ] Hostname / scheme consistent (`kidease.app` vs `kidease.ca` resolved)
- [ ] Icons + splash from current pipeline
- [ ] Status bar / safe area OK on notched phones

### PWA (helps mobile score before stores)
- [ ] Web manifest + icons
- [ ] Install / Add to Home Screen path
- [ ] Lightweight offline shell (chrome only)

### Push (optional for first submit)
- [ ] Scaffold OK with `FEATURE_PUSH=0`
- [ ] If promising vacancy alerts in store copy, enable FCM + APNs first
- [ ] Otherwise omit push claims from listing until live

### Universal / App Links (www.kidease.ca)

Store and OS probes hit these URLs. They must be **HTTP 200** `application/json` — not the SPA HTML shell, not a redirect.

| Path | After deploy |
| --- | --- |
| `https://www.kidease.ca/.well-known/apple-app-site-association` | AASA JSON (also served at `…/apple-app-site-association.json`) |
| `https://www.kidease.ca/.well-known/assetlinks.json` | Digital Asset Links JSON |

Expected AASA shape (bundle id is already `ca.daycarenearme.app`):

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "XXXXXXXXXX.ca.daycarenearme.app",
        "paths": ["*"],
        "appIDs": ["XXXXXXXXXX.ca.daycarenearme.app"],
        "components": [{ "/": "/*" }]
      }
    ]
  },
  "webcredentials": { "apps": ["XXXXXXXXXX.ca.daycarenearme.app"] }
}
```

`XXXXXXXXXX` is a **placeholder Team ID**, not a real Apple team. After Apple Developer enroll, set `APPLE_TEAM_ID` (or `APNS_TEAM_ID`) on Vercel — same 10-character id as Sign in with Apple / APNs. Then confirm `appID` / `appIDs` become `TEAMID.ca.daycarenearme.app`.

Expected `assetlinks.json` shape:

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "ca.daycarenearme.app",
      "sha256_cert_fingerprints": []
    }
  }
]
```

`sha256_cert_fingerprints` stays **empty on purpose** until Play App Signing exists. After Play Console enroll: App integrity → App signing → copy the **App signing** certificate SHA-256 (and the upload cert if shown). Set `ANDROID_SHA256_CERT_FINGERPRINTS` on Vercel (comma-separated if both). Do not invent a hash.

Xcode: add Associated Domains `applinks:www.kidease.ca` and `applinks:kidease.ca` when the Team is selected. Android: add an `https` VIEW / BROWSABLE intent-filter with `android:autoVerify="true"` for those hosts when you next touch the manifest.

Verify after deploy (must be 200, not 3xx):

```bash
curl -sI https://www.kidease.ca/.well-known/apple-app-site-association
curl -sI https://www.kidease.ca/.well-known/assetlinks.json
```

- [ ] `APPLE_TEAM_ID` set on Vercel after Apple enroll
- [ ] `ANDROID_SHA256_CERT_FINGERPRINTS` set on Vercel after Play App Signing
- [ ] Associated Domains + Android App Links intent-filter on the store binaries

### Quality gates before upload
- [ ] Typecheck / build green
- [ ] Physical device smoke: cold start, login, search Winnipeg, open listing, help
- [ ] No mixed-content / cleartext errors in WebView logs

---

## 4) Apple upload path

- [ ] Create App ID + provisioning profiles
- [ ] Xcode Archive signed with Distribution cert
- [ ] Upload to TestFlight
- [ ] Internal testers pass smoke
- [ ] App Privacy nutrition labels filled (location, contact info, etc.)
- [ ] Export compliance / encryption answers
- [ ] Screenshots: 6.7" + 6.1" (and iPad if supporting)
- [ ] Review notes: test account, CF Access not required for parent paths
- [ ] Submit for App Review

---

## 5) Google Play upload path

- [ ] Create upload keystore (backed up securely — never commit)
- [ ] Build AAB (`bundleRelease`)
- [ ] Play App Signing accepted
- [ ] Internal testing track upload
- [ ] Testers smoke on a real Android device
- [ ] Data safety form completed
- [ ] Content rating questionnaire
- [ ] Screenshots / feature graphic
- [ ] Promote to closed → production when ready

---

## 6) Store listing assets

- [ ] Name: KidEase
- [ ] Subtitle / short description (daycare near you / Canada–NA)
- [ ] Full description (discover, match, track, notify — honesty/trust)
- [ ] Screenshots from real product (home, search, listing, help)
- [ ] App icon (pin fill)
- [ ] Privacy policy link
- [ ] Support contact
- [ ] Category: Lifestyle or Parenting (pick one consistently)

---

## 7) Launch sequence (recommended)

1. Land web polish + map embed / FAQ fixes  
2. Capacitor scaffolding PR + device smoke  
3. Play internal + TestFlight (parallel)  
4. Soft review  
5. Public listings  
6. Then turn on push + deeper native polish  

---

## 8) Score impact (mobile pillar)

| Milestone | Approx mobile pillar |
|-----------|---------------------:|
| Web/PWA polish only | ~7 |
| TestFlight + Play internal | ~8 |
| Public stores + deeplinks + push | ~9 |

---

**Owner split**
- Kyle: Apple/Google accounts, legal URLs confirm, listing copy approval, first TestFlight/Play submit click  
- KidEase bot: Capacitor/PWA/push scaffolding PRs, permission strings, build docs, pre-submit QA on web + WebView
