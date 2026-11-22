# Threat model

This is a STRIDE pass over KidEase as it is built today. It names threats, the controls that are in the code, and the gaps. It is not a pentest. A pentest is recommended and is not part of this document.

KidEase is a Canadian daycare directory. Parents search listings and request tours. Daycare owners claim a listing and use a desk. Staff use a narrower desk. Admins and support run the service. A government desk is separate. Payments run through Stripe. The site is TanStack Start (Vite + Nitro) on Vercel, with Neon Postgres and Cloudflare R2 for files.

No feature flag is turned on by this document.

## Assets

- Parent accounts, child profiles, messages, enrolments, invoices, and consents.
- Daycare listings, licences, screening files, and staff records.
- Admin and support sessions.
- Government-desk access, which must stay off the parent and daycare APIs.
- Card payments. KidEase does not store the full card number. Stripe does.
- Uploaded photos and private documents.

## Actors

- A guest on the public site.
- A signed-in parent.
- A daycare owner or director.
- A staff member at one centre.
- An admin or support agent.
- A government-desk user.
- Someone outside the account (stolen session, guessed password, or a crafted request).

## Parent desk

| STRIDE | What could go wrong | What exists | Gap |
| --- | --- | --- | --- |
| Spoofing | Someone signs in as the parent. | Better Auth sessions. Passwords are stored as a hash. Sign-in is rate limited. | Phone apps are not a second factor for every parent. |
| Tampering | A request changes another parent's child, message, or invoice. | Server functions that touch a person's data use the session user id and filter queries with it. | A new query that forgets the user id would not be caught by a central policy. |
| Repudiation | A parent denies a consent or a message. | Consent rows store channel, purpose, time, and method. Messages store sender and time. | A person's own download is a separate change. This document does not add one. |
| Information disclosure | Another family's child or messages appear. | Inbox and child queries are tied to the signed-in user. Government sessions are rejected on private server functions. | Home-daycare street addresses are hidden until a tour, enrolment, or reply. A bug in that gate would publish an address. |
| Denial of service | A script hammers search or sign-in. | Auth rate limits. Cloudflare is in front of the site. | Search is public. A heavy query is not given a separate budget here. |
| Elevation | A parent opens the daycare or admin desk. | Role checks send each person to their own desk. | A wrong `profiles.role` value would grant the wrong desk. Role changes are an admin action. |

## Daycare desk

| STRIDE | What could go wrong | What exists | Gap |
| --- | --- | --- | --- |
| Spoofing | Someone claims a centre they do not run. | Claim flow checks the person and the licence path. | A weak claim review could attach the wrong centre. |
| Tampering | One centre edits another's listing, fees, or families. | Centre membership is checked before a centre write. | Staff permissions are a separate flag and default off. |
| Repudiation | A centre denies a fee or a message it sent. | Invoices and messages are stored with the centre id. | Centre replies in a thread are stored as the centre, not as a named staff person. |
| Information disclosure | A centre sees a child it does not care for. | A daycare sees a child file after enrolment or an explicit share. | A bad enrolment link would expose that child. |
| Denial of service | A centre upload or export stalls the desk. | Upload size caps below. | No per-centre rate limit is stated in this document. |
| Elevation | A billing-only person opens health notes. | Billing resources and health resources are separate lists in the role helper. | That split is only as strong as each screen that calls it. |

## Staff desk

| STRIDE | What could go wrong | What exists | Gap |
| --- | --- | --- | --- |
| Spoofing | A shared staff login. | Accounts are per person. | Nothing stops a centre from sharing a password. |
| Tampering | Staff edit a centre they do not work at. | Centre membership is required. | A removed staff row must be checked on every request. |
| Information disclosure | Staff read another room's child health notes. | Health pages are not part of the billing role. | Room-level limits depend on the screen. Some logs are centre-wide. |
| Elevation | Staff open owner billing or the admin desk. | Owner-only nav items are hidden for non-owners. The server still has to reject the action. | Hiding a link is not the control. The server check is. |

## Admin desk

| STRIDE | What could go wrong | What exists | Gap |
| --- | --- | --- | --- |
| Spoofing | A stolen admin session. | `requireAdmin` checks the admin role, two-factor, a trusted device, and a fresh idle window. | A trusted device that is not revoked stays valid until that check fails. |
| Tampering | An admin changes a live listing or a role by mistake. | Admin actions are explicit server functions. | There is no second-person approval on a role change. |
| Repudiation | An admin action has no actor. | Security events can record an actor id. The table is insert-only. | Not every admin button writes a security event. |
| Information disclosure | Admin view-as shows a family's data. | View-as is an admin path and is written to security events. | View-as is powerful. A bug in the write bypass would edit as the family. |
| Elevation | Support becomes admin. | Support can open the support desk. `requireAdmin` is a separate check. | Promoting a profile role is a database update. |

## Government desk

| STRIDE | What could go wrong | What exists | Gap |
| --- | --- | --- | --- |
| Information disclosure | A government user calls a parent or daycare API. | `rejectGovernmentOnPrivateApi` stops a government role on private server functions. Private HTTP zones use the same role split. | The government feature flags stay off until Kyle turns them on. This document does not turn them on. |
| Elevation | A government user is treated as admin. | The government role is not the admin role. | A profile with both would depend on which check runs first. The private-API check looks at the profile role. |

## Payments and Stripe

| STRIDE | What could go wrong | What exists | Gap |
| --- | --- | --- | --- |
| Spoofing | A fake webhook marks an invoice paid. | `src/lib/server/stripe-signature.ts` checks the Stripe signature with a timestamp and a timing-safe compare. | The webhook secret has to be set in the host. This document does not print it. |
| Tampering | A parent pays a different centre than the one on the bill. | Invoice rows store the parent and the daycare. Stripe metadata is read after the signature check. | A metadata mix-up would still be a bug. |
| Information disclosure | Card numbers land in KidEase. | Card data stays with Stripe. Audit text says card numbers are not stored. | Hosted invoice URLs are secret links. They should not be copied into exports or logs. |
| Repudiation | A payment has no receipt trail. | Stripe invoice ids and KidEase invoice rows are stored. | The app does not keep a second ledger outside Stripe and these rows. |
| Denial of service | Webhook retries pile up. | Webhook event ids are stored so a repeat is a no-op. | A long Stripe outage is Stripe's queue, not a KidEase retry storm in this document. |

## Children's data

| STRIDE | What could go wrong | What exists | Gap |
| --- | --- | --- | --- |
| Information disclosure | Child name, birth date, or health notes leak to the wrong adult. | Child rows are keyed by the parent user id. A centre sees a child after enrolment or a share. Public listing photos must not show an identifiable child. That rule is in the provider terms. | Photo review is not an automatic face check. |
| Tampering | A centre edits a child's health note the parent did not share. | Health resources are not in the billing-only allow list. | Each health screen has to enforce that. |
| Information disclosure | Analytics or error reports contain a child name. | The privacy policy says analytics and error reports strip names and child details before send, and analytics wait for consent in Quebec. | A new log line can violate that if it prints the request body. |
| Elevation | A co-parent sees a child without a link. | Co-parent flags default off. | Turning them on later needs the link check. This document does not turn them on. |

## File uploads

| STRIDE | What could go wrong | What exists | Gap |
| --- | --- | --- | --- |
| Tampering | A file is not the type it claims. | Listing photos reject anything over 1,800,000 bytes (`LISTING_PHOTO_MAX_BYTES`). Private docs (screening and licence) allow PDF, JPEG, PNG, and WebP up to 4 MB (`PRIVATE_DOC_MAX_BYTES`). Identity files allow JPEG, PNG, and PDF up to 8 MB. R2 objects are capped at 4 MB in `R2_MAX_OBJECT_BYTES`. | Type checks use the declared MIME type. They do not all reopen the file to confirm the bytes. |
| Information disclosure | A private licence or a child file is served on the public site. | Screening and licence keys use `screening/` and `licenses/`. Family files use `family-docs/`. The private-doc comment says these are never public listing prefixes. | A wrong key prefix would make a private object public. |
| Denial of service | A huge upload fills the function. | The size caps above reject the body before a bigger store write. | The caps are per file, not a daily quota per account. |
| Elevation | A parent uploads into another centre's folder. | The server has to choose the key from the session, not from a client path. | Any upload route that trusts a client key is a gap. |

## Recommended and out of scope

A pentest of the parent desk, daycare desk, staff desk, admin desk, government desk, Stripe webhooks, child files, and uploads is recommended. It is not done here.

This document does not change production flags, send email or SMS, or take a payment.
