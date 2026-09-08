# Waitlist pulse (v1)

When a centre marks a spot open, KidEase notifies parents who opted in on that listing and parents whose saved search matches location + age.

This is transactional. **It does not send FCM / APNs.** `FEATURE_PUSH` stays off. SMS only leaves Twilio when `FEATURE_SMS=1`, credentials exist, and a stored CASL `sms` / `service` grant is on the parent (plus no STOP block).

## What landed

- Parent **opt-in** on a live listing (`/daycare/:slug`).
- Director **Notify waitlist — spot open** on the daycare desk (listing form + vacancy confirm loop).
- Capacity increase on `updateCapacity` also creates a pulse when the total spot count goes up (same cooldown).
- Inngest function `waitlist-pulse` (`kidease/waitlist.pulse`). When `INNGEST_*` keys are unset, the job runs inline so local / preview still works.
- In-app notice on the family desk (Search alerts). SMS uses `sendSms` + CASL.

## Migration `0038_waitlist_pulse.sql`

| Table | Purpose |
| --- | --- |
| `waitlist_interests` | Parent opt-in on a listing (`age_band`, `notify_in_app`, `notify_sms`) |
| `waitlist_pulses` | One row = one spot event (`director` or `capacity`) |
| `waitlist_pulse_deliveries` | Fan-out log. Unique `(pulse_id, user_id, channel)` — retries do not double-text |

`search_alert_notices.kind` also allows `waitlist_pulse`.

## Matching

1. **Listing opt-in** on that daycare.
2. **Open spot request** (`requested` / `under_review` / `waitlist`).
3. **Saved search** with `alerts_enabled` whose origin is inside the saved radius and whose age / filters match. Avail + `confirmedOnly` are ignored — the pulse *is* the vacancy event. Invalid origins are skipped (no Winnipeg default).

If the pulse lists open age-band counts, only those ages (or `any`) match. If every count is 0, the director still said a spot opened — notify all opted-in matches.

## Do not spam

- One pulse row per click / capacity-up event.
- **4 hour cooldown** per daycare (`WAITLIST_PULSE_COOLDOWN_MS`).
- Delivery unique on `(pulse_id, user_id, channel)`.
- Inngest `idempotency` + event `id` = `pulseId`.

Vacancy *timestamp* refresh (`refreshVacancy`) does **not** pulse. Hourly search-alerts still handle `vacancy_reconfirmed`.

## Flags

| Flag | This PR |
| --- | --- |
| `FEATURE_SMS` | Stays `0` in `.env.example`. Job calls `sendSms`, which no-ops until Kyle flips env or the PostHog overlay (`docs/flags.md`). |
| `FEATURE_PUSH` | Stays `0`. Job never imports FCM / APNs. |
| `INNGEST_*` | Unset = inline fan-out. Set = Cloud owns the job. |

Do not invent Twilio or Inngest secrets.

## Later (not this PR)

- Push fan-out after a dry-run token count (needs `FEATURE_PUSH=1` + a native binary).
- Persist Twilio status-callback rows.
- Parent age-band picker on the listing opt-in (schema already stores `age_band`).
