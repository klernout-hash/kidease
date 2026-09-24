# Email bounce and complaint protection

Outreach blasts must skip addresses that hard-bounced or complained. Resend tells KidEase through a signed webhook. The site stores the denylist in Neon and, when `GHL_API_TOKEN` is set, marks the matching GoHighLevel contact so the CRM does not email them either.

Unset `RESEND_WEBHOOK_SECRET` is a no-op: `POST /api/webhooks/resend` returns 200 and writes nothing. Unset `GHL_API_TOKEN` still records the Neon row and skips the CRM call.

## Register the webhook (Kyle)

1. Resend dashboard → **Webhooks** → **Add endpoint**.
2. Endpoint URL: `https://www.kidease.ca/api/webhooks/resend`
3. Subscribe to these events only:
   - `email.bounced`
   - `email.complained`
   - `email.delivered`
   - `email.delivery_delayed`
   - `email.suppressed`
   - `suppression.added`
   - `suppression.removed`
4. Copy the signing secret (`whsec_…`).
5. Paste it on Vercel (project `kidease-git`, Production and Preview) as `RESEND_WEBHOOK_SECRET`. Do not prefix it with `VITE_`. Do not commit the value.
6. Redeploy so the server sees the secret.

A bad signature is rejected with 401. Resend retries when the handler returns 500 (database down). A successful apply returns 200 even if the GoHighLevel call fails.

## What gets suppressed

| Event | Neon |
|---|---|
| `email.bounced` with bounce type `Permanent` | Upsert `email_suppressions` reason `bounce`. Log the event. |
| `email.bounced` Temporary or anything other than Permanent | Log only. Not suppressed. |
| `email.complained` | Upsert reason `complaint`. |
| `email.suppressed` | Upsert (already on Resend’s list). |
| `suppression.added` | Upsert. Origin `bounce`, `complaint`, `manual`, or `unsubscribe`. |
| `suppression.removed` | Delete the denylist row. GoHighLevel DND is left as-is. |
| `email.delivered`, `email.delivery_delayed` | Log only. Used for the admin rates. |

A later bounce does not replace an existing complaint.

## GoHighLevel

When a row is suppressed and `GHL_API_TOKEN` is set (and `FEATURE_GHL_INTAKE` is not `0`):

- Look up the contact by email at location `hkAJnVH8EJpMcgq9bNjG`. No contact is created.
- Add tag `email:bounced` or `email:complained`.
- Set email-channel DND: `dndSettings.Email.status = permanent`. Calls and SMS are not put on global DND.

The call is swallowed on failure. It never fails the webhook.

## Before a blast

Saved-search alert email calls `isSuppressed(email)` and skips the send.

Other outreach scripts:

```bash
node --experimental-strip-types scripts/export-suppressions.mjs
node --experimental-strip-types scripts/export-suppressions.mjs --json
```

Or, with an admin session: `GET /api/admin/email-suppressions` (JSON) and `?format=text` (one email per line).

Tag Resend sends with `{ "name": "campaign", "value": "your-campaign" }` so the health board can group them. Saved-search mail uses `search-alerts`.

## Admin health

`/admin-email-health` (also linked from Admin → Mail) shows delivered, hard-bounced, and complained counts per campaign tag for the last 7 and 30 days.

- Bounce rate = hard bounces / (delivered + hard bounces).
- Complaint rate = complaints / delivered.
- A red row means bounce rate ≥ 2% or complaint rate ≥ 0.08%. Pause that campaign.
