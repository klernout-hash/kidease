# Automation pack

KidEase can email parents and daycares, page Kyle when a job fails, and keep a weekly database copy. **Nothing new sends until you turn a flag on, then turn its `_LIVE` switch on.**

In-app subscriptions stay off. Do not set `SUBSCRIPTIONS_ENABLED` or `SHOW_PAY_CTAS`. Do not add Apple or Google in-app purchases. This pack does not change those flags. Parent **bill** reminders are daycare invoices already in the database. They are not a KidEase plan.

Stripe `invoice.finalized` / `paid` / `failed` webhook alerts and the in-app invoice list are a separate change. This pack only reads invoice rows for reminders and stops when `paid_at` is set or the status is paid, void, or refunded.

## Flags

Each new flag defaults **off**. `FEATURE_NAME=1` runs the job in **dry-run** (the server log shows who would get mail). `FEATURE_NAME_LIVE=1` sends, hides spots, or uploads a backup.

| Flag | Default | What it does |
| --- | --- | --- |
| `FEATURE_POSTHOG_ERRORS` | off | Browser and server `$exception` in PostHog. Bots and WebDriver are dropped. |
| `FEATURE_OPS_ALERTS` | off | Email `kyle@kidease.ca`. Immediate if a cron fails or server errors hit 25 in an hour. Daily digest at 8:00 America/Winnipeg. |
| `FEATURE_CRON_HEARTBEATS` | off | GET a Better Stack heartbeat after a successful cron. URL env: `BETTERSTACK_HEARTBEAT_<JOB>`. |
| `FEATURE_INVOICE_REMINDERS` | off | Email 3 days before a bill is due, on the due date, and 3 and 7 days later. |
| `FEATURE_PAYMENT_DUNNING` | off | Email the day a payment fails, then 3 and 7 days later. Stops when the bill is paid. |
| `FEATURE_MISSING_INFO_REMINDERS` | off | Monday email listing missing licence, photo, fees, hours, contact, or ages, with a link to that field. Also parents with no child name and birthdate. Max one a week. |
| `FEATURE_DAYCARE_ONBOARDING` | off | Email the centre on day 0, day 2, and day 7 after claim. |
| `FEATURE_CLAIM_LISTING_REMINDERS` | off | Email an unclaimed centre at its published business address. CASL implied consent, unsubscribe, max 3, at least 14 days apart. Daily cap `CLAIM_REMINDER_DAILY_CAP` (default 25). |
| `FEATURE_STALE_OPEN_SPOTS` | off | Email at day 21. Hide the open-spot count at day 30 until the centre updates it. |
| `FEATURE_POST_TOUR_FOLLOWUP` | off | One email 24–72 hours after a tour. |
| `FEATURE_ENROLMENT_REVIEW` | off | One optional review invite 30–37 days after enrolment. Every enrolled parent. No star gate. |
| `FEATURE_NEON_BACKUP` | off | Sunday `pg_dump` to R2 `backups/neon/YYYY-MM-DD.dump`, then `pg_restore --list`. Failure marks the run failed. |

SMS for these jobs is not sent. Open-spots texts stay on `FEATURE_OPEN_SPOTS_CHECKIN_SMS` plus `FEATURE_SMS` and stored CASL consent. Quiet hours are 9pm–8am in the family’s time zone (Winnipeg if we do not know it). Commercial mail includes an unsubscribe link and stops for bounces, complaints, and unsubscribes. A bill reminder still goes out after an unsubscribe. It stops for a bounce or complaint.

`AUTOMATION_TEST_EMAILS=you@example.com` limits live and dry-run mail to that list. Ops mail to Kyle is not limited by that list.

## Crons

Vercel times are UTC. Inngest uses `America/Winnipeg`. Both call the same job. When Inngest keys are set, the Vercel route skips unless `?dryRun=1` or `?force=1`.

| Job | Vercel (UTC) | Inngest (Winnipeg) |
| --- | --- | --- |
| `ops-alerts` | `5 * * * *` | `5 * * * *` |
| `invoice-reminders` | `30 13 * * *` (08:30 CDT) | `30 8 * * *` |
| `listing-reminders` | `45 14 * * *` (09:45 CDT) | `45 9 * * *` |
| `stale-open-spots` | `15 15 * * *` (10:15 CDT) | `15 10 * * *` |
| `tour-followups` | `25 * * * *` | `25 * * * *` |
| `neon-backup` | `30 8 * * 0` | `30 2 * * 0` Sunday |

Paths are `/api/automations?job=<name>`. Bearer `CRON_SECRET`. Sends are idempotent in `automation_sends`.

## Flags that already exist (turn on when you are ready)

These were already off. This pack does not flip them.

| Flag | Send |
| --- | --- |
| `FEATURE_OPEN_SPOTS_CHECKIN_MAIL` | Weekly open-spots email. Cron `/api/open-spots-checkin` Mondays. |
| `FEATURE_OPEN_SPOTS_CHECKIN_SMS` | Same check-in by text. Also needs `FEATURE_SMS`, CASL, and Twilio. |
| `FEATURE_SPOT_OFFER_MAIL` | Email when a daycare offers a spot. The offer still shows in the account while this is off. |
| `FEATURE_OPEN_SPOT_ALERTS` | Email when a saved search matches a new open spot. Needs CASL. |

## Safe rollout

1. Leave every new flag off in production. Confirm `/admin-automations` loads on the website (not in the phone app).
2. On Preview, set one flag to `1` and `AUTOMATION_TEST_EMAILS` to a mailbox you own. Hit the cron with `?dryRun=1` and the bearer secret. Read the log line `[kidease-automation] dry-run`. No parent mail.
3. Set that flag’s `_LIVE=1` on Preview only, still with `AUTOMATION_TEST_EMAILS`. Confirm one mail, the unsubscribe link, and that a second run does not send again.
4. Production order:
   1. `FEATURE_CRON_HEARTBEATS` then `_LIVE` after Better Stack URLs exist.
   2. `FEATURE_POSTHOG_ERRORS` then `_LIVE`.
   3. `FEATURE_OPS_ALERTS` then `_LIVE` (you should get the 8:00 digest).
   4. `FEATURE_NEON_BACKUP` dry-run, then `_LIVE` on a Sunday. Confirm the R2 object and a failed run emails you.
   5. `FEATURE_STALE_OPEN_SPOTS` dry-run, then `_LIVE`.
   6. `FEATURE_INVOICE_REMINDERS` and `FEATURE_PAYMENT_DUNNING` with the test allowlist, then remove the allowlist.
   7. `FEATURE_MISSING_INFO_REMINDERS`, `FEATURE_DAYCARE_ONBOARDING`, `FEATURE_POST_TOUR_FOLLOWUP`, `FEATURE_ENROLMENT_REVIEW`.
   8. `FEATURE_CLAIM_LISTING_REMINDERS` last. Keep the daily cap. It is the only cold email.
   9. Existing open-spot flags only after the dry-run logs look right. SMS last, and only with `FEATURE_SMS` still gated on consent.

Do not merge this until Kyle says so. Do not enable subscriptions.
