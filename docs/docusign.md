# DocuSign for KidEase

Admin (`kyle@kidease.ca`, `profiles.role = admin`) sends two packs from **Admin → Contracts**:

1. **Provider agreement** — licensed centre agreement (bilingual FR-CA fallback document, or your DocuSign template).
2. **Enrolment paperwork pack** — centre acknowledgement for KidEase enrolment tools.

DocuSign emails the provider. When the envelope completes, KidEase stores the combined signed PDF on that daycare’s profile:

- Admin: Contracts tab and Daycares / queue chips (`PDF`)
- Provider desk: **Contract** tab
- Authenticated download: `/api/contracts/{id}/pdf` (admin or that centre’s owner). Not a public listing photo.

Until JWT keys are set, **Send (DocuSign off)** stays disabled. Centres can still sign the in-app bilingual document from `/sign/{id}`.

If JWT consent is still pending (`user_not_found` / `invalid_grant`), Admin Contracts stays up and shows **DocuSign not connected — finish JWT consent**. That failure must not throw into ErrorBoundary.

`FEATURE_SMS` stays off. This integration does not touch Stripe Connect.

## Vercel env (Production + Preview)

Set these as encrypted environment variables. Names only in `.env.example` — never paste a real PEM or HMAC into git.

| Name | Where it comes from |
| --- | --- |
| `DOCUSIGN_INTEGRATION_KEY` | Apps and Keys → Integration Key (also accepted as `DOCUSIGN_CLIENT_ID`) |
| `DOCUSIGN_USER_ID` | Apps and Keys → User ID (GUID of the impersonated user, usually Kyle) |
| `DOCUSIGN_ACCOUNT_ID` | Apps and Keys → API Account ID |
| `DOCUSIGN_PRIVATE_KEY` | RSA private key PEM. On Vercel, keep `\n` as the two characters `\` `n` |
| `DOCUSIGN_ENV` | `demo` (developer account) or `production` |
| `DOCUSIGN_WEBHOOK_SECRET` | Connect HMAC key (header only — never `?secret=` on the URL) |
| `DOCUSIGN_TEMPLATE_PROVIDER_AGREEMENT` | Template ID for the provider agreement (optional) |
| `DOCUSIGN_TEMPLATE_ENROLMENT_PACK` | Template ID for the enrolment pack (optional) |
| `DOCUSIGN_TEMPLATE_ROLE` | Template role name. Default `Provider` |
| `APP_ORIGIN` | `https://www.kidease.ca` so Connect callbacks hit production |

Optional overrides: `DOCUSIGN_AUTH_BASE`, `DOCUSIGN_BASE_URI`. Demo defaults to `account-d.docusign.com` / `demo.docusign.net`.

Webhook and poll reject query-string secrets. Vercel Cron sends `Authorization: Bearer $CRON_SECRET` to `/api/docusign/poll` (reuse the existing cron secret).

Signed PDFs prefer R2 (`contracts/{daycareId}/{contractId}.pdf`) when R2 is configured. If R2 is missing, download still pulls the combined PDF from DocuSign for an authorized session.

## Dashboard steps (login outside this PR)

These need Kyle’s DocuSign login. Do them once per environment (demo, then production).

### 1. Create the integration key

1. Open [DocuSign eSignature Admin](https://admindemo.docusign.com/) (demo) or the production admin.
2. **Integrations → Apps and Keys → Add App and Integration Key**.
3. Name it `KidEase`.
4. **Authentication → RSA Keypair → Add RSA**. Download the private key once. Paste it into `DOCUSIGN_PRIVATE_KEY` on Vercel.
5. Copy Integration Key, User ID, and API Account ID into the env names above.
6. **Redirect URIs** (JWT consent only — not a login callback with a secret):
   - `https://www.kidease.ca`
   - `https://kidease.ca`
   - `http://localhost:8080` for local JWT consent

### 2. Grant JWT consent (one-time)

In a browser, while signed in as the impersonated user:

```
https://account-d.docusign.com/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=INTEGRATION_KEY&redirect_uri=https://www.kidease.ca
```

Use `https://account.docusign.com` when `DOCUSIGN_ENV=production`. Accept. KidEase never stores the code; JWT uses the RSA key after this grant.

### 3. Create templates

1. **Templates → New**.
2. Upload the Provider Agreement PDF (or build it in DocuSign). Add a **Sign Here** tab on the `Provider` role (or the name in `DOCUSIGN_TEMPLATE_ROLE`).
3. Repeat for the Enrolment pack.
4. Copy each Template ID into `DOCUSIGN_TEMPLATE_PROVIDER_AGREEMENT` and `DOCUSIGN_TEMPLATE_ENROLMENT_PACK`.
5. Admin → Contracts can also pick any template returned by the account, or send the bilingual KidEase document without a template.

### 4. Connect webhook (HMAC)

1. **Connect → Add Configuration** (or Custom Connect).
2. URL: `https://www.kidease.ca/api/docusign/webhook`  
   No query string. Do not put the HMAC on the URL.
3. Enable envelope events: Sent, Delivered, Completed, Declined, Voided.
4. Include HMAC signature. Generate a key and set it as `DOCUSIGN_WEBHOOK_SECRET` on Vercel.
5. JSON REST v2.1 payload if offered.

KidEase also attaches `eventNotification` on each envelope and polls `/api/docusign/poll` hourly if a webhook is missed.

### 5. Redeploy and send

1. Save env on Vercel Production + Preview. Redeploy.
2. Sign in as admin on www. **Admin → Contracts**.
3. Pick pack, template, and provider email. **Send to sign**.
4. After the provider signs, open the daycare Contract tab or the admin PDF link.

## Local / preview

Without the JWT env names, the Contracts board is a status list only. In-app signing still works for demo envelopes (`demo_{contractId}`). Do not point a store binary at a DocuSign demo webhook.
