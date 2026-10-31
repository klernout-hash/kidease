# Growth loops

`FEATURE_GROWTH_LOOPS` defaults **off**. Also set `VITE_FEATURE_GROWTH_LOOPS=1` when the share button should send PostHog events in the browser. Server thank-yous and family invites read `FEATURE_GROWTH_LOOPS`.

## What parents and daycares see when it is on

- A parent share link can record a **thank-you note** when a new parent joins. Cap 20. Not cash, not credit, not a free month. Parents stay in the free founding period.
- Listing `og:image` for a real catalogue photo uses `https://media.kidease.ca/photos/…`. Listings with no safe photo keep `https://www.kidease.ca/og.jpg`. Child photos are not used.
- A claimed daycare can open `/provider/families` and copy an invite link (`/welcome/:code`).
- PostHog events (only when the flag is on): `referral_opened`, `referral_joined`, `listing_shared`, `family_invite_opened`, `family_invite_created`. Properties are `code`, `listing_slug`, and `locale`. No email, phone, or child name.

## GHL (not in the app)

The CRM bot can mirror these events in GoHighLevel. Do not build pipelines, deals, or contact lists inside KidEase.

- Tag a contact `kidease-referral` and store `referral_code` when `referral_joined` fires.
- Tag `kidease-family-invite` with `invite_code` and the public centre name.
- Thank-you notes stay a count in KidEase. Do not pay the referrer from GHL.
- SMS from GHL only with CASL consent already stored. KidEase does not send that SMS here.
