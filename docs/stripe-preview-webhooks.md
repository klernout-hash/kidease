# Stripe test webhooks on Vercel Preview

Preview deployments take **test-mode** Stripe events. Live events still use `STRIPE_WEBHOOK_SECRET`.

The handler is `POST /api/stripe/webhook`.

When the JSON body has `livemode: false`, the signature is checked with `STRIPE_WEBHOOK_SECRET_TEST`. If that variable is empty, the handler uses `STRIPE_WEBHOOK_SECRET` (and `STRIPE_CONNECT_WEBHOOK_SECRET` when set). Live events (`livemode` not false) never use the test secret.

The same Stripe event id is stored once. A retry does not send the email or SMS again.

## Preview environment variables

Set these on the Vercel **Preview** environment, not Production. Do not put a live secret key on Preview.

| Name | Value |
| --- | --- |
| `STRIPE_SECRET_KEY` | Test secret key from Stripe (test mode). |
| `STRIPE_PUBLISHABLE_KEY` | Matching test publishable key, if checkout runs on that preview. |
| `STRIPE_WEBHOOK_SECRET_TEST` | Signing secret of the **test** webhook endpoint below. |
| `STRIPE_WEBHOOK_SECRET` | Leave as the live secret, or unset on Preview. Test events do not need it when `STRIPE_WEBHOOK_SECRET_TEST` is set. |

`FEATURE_SMS` stays off until SMS is ready. Invoice email still sends. Invoice SMS sends only when that flag is on **and** the person has a stored CASL SMS consent row. Texts wait until 08:00 in their time zone.

Leave `SUBSCRIPTIONS_ENABLED` at 0. This does not turn on parent or daycare plan checkout, and it does not enable Apple or Google in-app purchases. Existing subscription code stays as it is.

Redeploy the preview after saving the variables so the new values are loaded.

## Create the Stripe test webhook

1. Open the Stripe Dashboard and turn **Test mode** on (the switch in the dashboard header).
2. Go to **Developers → Webhooks**.
3. Click **Add endpoint**.
4. Endpoint URL: `https://<your-preview-host>/api/stripe/webhook`  
   Example: `https://kidease-git-git-cursor-stripe-test-invoices-031c-kyle.vercel.app/api/stripe/webhook`  
   Use the real Preview URL from the Vercel deployment. No trailing slash.
5. API version: leave the account default.
6. Select these events:
   - `invoice.finalized`
   - `invoice.paid`
   - `invoice.payment_failed`
   - `payment_intent.succeeded`
   - `checkout.session.completed`
   - `payout.paid`
   - `account.updated`
7. Click **Add endpoint**.
8. Open the new endpoint and reveal the **Signing secret**.
9. Paste that secret into Vercel Preview as `STRIPE_WEBHOOK_SECRET_TEST`.
10. Confirm Preview `STRIPE_SECRET_KEY` is the test secret key, then redeploy.

Send a test `invoice.finalized` from the endpoint page in Stripe. The response should be HTTP 200. A second delivery of the same event id returns `"duplicate": true` and does not send another email.

Parent invoices need `metadata.parent_user_id` and `metadata.daycare_id` (or `metadata.bill_id`, or a customer email that matches a KidEase account, plus a Connect account on the daycare). `metadata.kidease` may be `parent_invoice` or `bill`. Fee-tax invoices and platform subscriptions stay on their existing paths.
