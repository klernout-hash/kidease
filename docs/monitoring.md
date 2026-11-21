# Ops alerts

This page says how to turn monitoring on. It does not change a production flag, send a message, or take a payment.

The jobs already exist. The safe order is in [docs/automations.md](automations.md). Each flag defaults **off**. `FEATURE_NAME=1` without `FEATURE_NAME_LIVE=1` is a dry run. Mail and heartbeats start only after the matching `_LIVE` flag is also on.

## Flags Kyle can turn on

Leave these off until you want that signal. Set them in the host. Do not commit the values.

| Flag | Live switch | What it does when both are on |
| --- | --- | --- |
| `FEATURE_CRON_HEARTBEATS` | `FEATURE_CRON_HEARTBEATS_LIVE` | After a successful cron, GET the Better Stack URL in `BETTERSTACK_HEARTBEAT_<JOB>`. A missing URL does nothing. |
| `FEATURE_POSTHOG_ERRORS` | `FEATURE_POSTHOG_ERRORS_LIVE` | Send `$exception` events from the site and the server. Bots and WebDriver are dropped. |
| `FEATURE_OPS_ALERTS` | `FEATURE_OPS_ALERTS_LIVE` | Email kyle@kidease.ca. Immediate when a cron fails or server errors reach 25 in an hour (`OPS_CRITICAL_ERROR_COUNT`). A daily digest at 8:00 America/Winnipeg. |

`/api/health` stays public either way. It reports `ok`, `service: kidease`, and the app and database checks. It does not include secrets.

## Suggested order

1. `FEATURE_CRON_HEARTBEATS`, then `_LIVE`, after the Better Stack heartbeat URLs exist.
2. `FEATURE_POSTHOG_ERRORS`, then `_LIVE`.
3. `FEATURE_OPS_ALERTS`, then `_LIVE`. Confirm the digest arrives before turning on parent or daycare mail.

Parent and daycare mail flags (`FEATURE_INVOICE_REMINDERS`, `FEATURE_PAYMENT_DUNNING`, and the others in `docs/automations.md`) are separate. This page does not turn them on.
